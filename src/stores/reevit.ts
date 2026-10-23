/**
 * Reevit Svelte Store
 * Factory function to create a reactive checkout store for Svelte applications
 */

import {
  ReevitAPIClient,
  createInitialState,
  reevitReducer,
  detectCountryFromCurrency,
  resolveIntentIdentity,
  cacheIntentPromise,
  cacheIntentResponse,
  clearIntentCacheEntry,
  type ReevitCheckoutConfig,
  type CheckoutState,
  type PaymentMethod,
  type PaymentResult,
  type PaymentError,
  type PaymentIntent,
  type ReevitState,
  type ReevitAction,
  type PaymentIntentResponse,
  type PSPType,
  type CheckoutProviderOption,
  type ReevitTheme,
} from '@reevit/core';

import { isPaymentFailure, pollPaymentStatus } from '../utils/pollPaymentStatus';

const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.reevit.io';

/**
 * After the provider reports success the backend can still say `pending` for a while
 * (webhooks and verification are slow). Keep asking, calmly, for up to two minutes.
 */
const CONFIRM_TIMEOUT_MS = 120_000;
const CONFIRM_INTERVAL_MS = 4_000;

/** `confirming`: the provider said paid, the backend has not agreed yet. `unconfirmed`: it still had not at the deadline. */
export type Confirmation = 'idle' | 'confirming' | 'unconfirmed';
/** The core states, plus the two the checkout reports while a paid provider payment is unconfirmed. */
export type ReevitStateChange = CheckoutState | 'confirming' | 'pending';
/** What the store publishes: the core state plus the confirmation phase. */
export type ReevitStoreState = ReevitState & { confirmation: Confirmation };

function buildPaymentLinkError(response: Response, data: any): PaymentError {
  return {
    code: data?.code || 'payment_link_error',
    message: data?.message || 'Payment link request failed',
    recoverable: true,
    details: {
      httpStatus: response.status,
      ...(data?.details || {}),
    },
  };
}

interface CreateReevitStoreOptions {
  config: ReevitCheckoutConfig;
  onSuccess?: (result: PaymentResult) => void;
  onError?: (error: PaymentError) => void;
  onClose?: () => void;
  onStateChange?: (state: ReevitStateChange) => void;
  apiBaseUrl?: string;
}

interface CheckoutSessionSelectionResponse {
  payment_intent: PaymentIntentResponse;
}

async function selectCheckoutSession(
  sessionSecret: string,
  method: PaymentMethod,
  provider: string,
  idempotencyKey: string,
  apiBaseUrl?: string,
  /** The payer's mobile money number, so the provider can push its prompt to it. */
  phone?: string,
  /** 0 for the first try, then 1, 2, 3 for retries (a fresh prompt each). */
  attempt?: number,
): Promise<{ data?: CheckoutSessionSelectionResponse; error?: PaymentError }> {
  const response = await fetch(
    `${apiBaseUrl || DEFAULT_PUBLIC_API_BASE_URL}/v1/checkout/sessions/${encodeURIComponent(sessionSecret)}/select`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Reevit-Client': '@reevit/svelte',
        'X-Reevit-Client-Version': '0.12.1',
      },
      body: JSON.stringify({
        method,
        provider,
        ...(phone ? { phone } : {}),
        ...(attempt ? { attempt } : {}),
      }),
    },
  );
  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      error: {
        code: responseData?.code || 'checkout_session_selection_error',
        message: responseData?.message || 'Checkout session selection failed',
        recoverable: response.status >= 500,
        details: {
          httpStatus: response.status,
          ...(responseData?.details || {}),
        },
      },
    };
  }

  return { data: responseData as CheckoutSessionSelectionResponse };
}

// FNV-1a, 128-bit parameters (RFC draft-eastlake-fnv): offset basis and prime.
const FNV_1A_128_OFFSET_BASIS = 0x6c62272e07bb014262b821756295c58dn;
const FNV_1A_128_PRIME = 0x0000000001000000000000000000013bn;
const FNV_1A_128_MASK = (1n << 128n) - 1n;

/**
 * 128-bit digest of a UTF-8 string, as 32 lowercase hex characters.
 *
 * Deliberately synchronous: `checkoutSelectionIdentity` is read on the
 * synchronous path of `initialize()`, before the in-flight intent promise is
 * registered, so two Continue clicks in the same tick both reach the cache.
 * Awaiting `crypto.subtle.digest` here would let both clicks slip past that
 * cache and send two selection requests.
 *
 * FNV-1a is not a cryptographic hash and is not used as one: the input already
 * travels to the same endpoint in the request URL, so the key reveals nothing
 * new. What matters is the output space — 2^128 instead of djb2's 2^32, which
 * collided at ~50% odds around 77k distinct selections inside the backend's
 * 24h idempotency window.
 */
function digest128Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hash = FNV_1A_128_OFFSET_BASIS;

  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_1A_128_PRIME) & FNV_1A_128_MASK;
  }

  return hash.toString(16).padStart(32, '0');
}

/**
 * Stable identity for one (session, method, provider) selection.
 *
 * Determinism is intentional — re-selecting the same method on the same session
 * must replay the first selection rather than create a second one — so this must
 * never become a random UUID.
 */
export function checkoutSelectionIdentity(
  sessionSecret: string,
  method: PaymentMethod,
  provider: string,
  /** What else makes this selection distinct, such as the number and retry. Omit for the plain triple. */
  extra?: string,
): string {
  return `reevit_checkout_selection_${digest128Hex(`${sessionSecret}:${method}:${provider}${extra ? `:${extra}` : ''}`)}`;
}

/** Folds the payer's number and the retry into the idempotency scope without writing the number into a header. */
function selectionVariant(phone: string | undefined, attempt: number | undefined): string {
  return [phone ? `p${digest128Hex(phone)}` : '', attempt ? `a${attempt}` : ''].filter(Boolean).join(':');
}

// Subscriber type for writable store compatibility
type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;

/**
 * Maps PSP provider names from backend to PSP type
 */
function mapProviderToPsp(provider: string): PSPType {
  const providerLower = provider.toLowerCase();
  if (providerLower.includes('paystack')) return 'paystack';
  if (providerLower.includes('hubtel')) return 'hubtel';
  if (providerLower.includes('flutterwave')) return 'flutterwave';
  if (providerLower.includes('stripe')) return 'stripe';
  if (providerLower.includes('monnify')) return 'monnify';
  if (providerLower.includes('mpesa') || providerLower.includes('m-pesa')) return 'mpesa';
  return 'paystack';
}

function normalizeProviderMethod(method: string): PaymentMethod | null {
  const normalized = method.toLowerCase().trim();
  if (normalized === 'card') return 'card';
  if (normalized === 'mobile_money' || normalized === 'momo' || normalized === 'mobilemoney') return 'mobile_money';
  if (normalized === 'bank' || normalized === 'bank_transfer' || normalized === 'transfer') return 'bank_transfer';
  return null;
}

function mapAvailableProviders(
  providers?: Array<{ provider: string; name: string; methods: string[]; countries?: string[] }>
): CheckoutProviderOption[] | undefined {
  if (!providers || providers.length === 0) return undefined;

  return providers
    .map((provider) => {
      const methods = provider.methods
        .map((method) => normalizeProviderMethod(method))
        .filter(Boolean) as PaymentMethod[];

      return {
        provider: provider.provider,
        name: provider.name,
        methods,
        countries: provider.countries,
      };
    })
    .filter((provider) => provider.methods.length > 0);
}

function normalizeBranding(branding?: Record<string, unknown>): ReevitTheme {
  if (!branding) {
    return {};
  }

  const raw = branding as Record<string, unknown>;
  const theme: Record<string, unknown> = { ...raw };
  const getString = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const getBoolean = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

  const setIf = (key: string, value: unknown) => {
    if (value !== undefined) {
      theme[key] = value;
    }
  };

  setIf('logoUrl', getString(raw.logoUrl ?? raw.logo_url));
  setIf('companyName', getString(raw.companyName ?? raw.company_name));
  setIf('primaryColor', getString(raw.primaryColor ?? raw.primary_color));
  setIf('primaryForegroundColor', getString(raw.primaryForegroundColor ?? raw.primary_foreground_color));
  setIf('backgroundColor', getString(raw.backgroundColor ?? raw.background_color));
  setIf('surfaceColor', getString(raw.surfaceColor ?? raw.surface_color));
  setIf('textColor', getString(raw.textColor ?? raw.text_color));
  setIf('mutedTextColor', getString(raw.mutedTextColor ?? raw.muted_text_color));
  setIf('borderRadius', getString(raw.borderRadius ?? raw.border_radius));
  setIf('fontFamily', getString(raw.fontFamily ?? raw.font_family));
  setIf('darkMode', getBoolean(raw.darkMode ?? raw.dark_mode));
  setIf('pspSelectorBgColor', getString(raw.pspSelectorBgColor ?? raw.psp_selector_bg_color));
  setIf('pspSelectorTextColor', getString(raw.pspSelectorTextColor ?? raw.psp_selector_text_color));
  setIf('pspSelectorBorderColor', getString(raw.pspSelectorBorderColor ?? raw.psp_selector_border_color));
  setIf('pspSelectorUseBorder', getBoolean(raw.pspSelectorUseBorder ?? raw.psp_selector_use_border));
  setIf('selectedBackgroundColor', getString(raw.selectedBackgroundColor ?? raw.selected_background_color));
  setIf('selectedTextColor', getString(raw.selectedTextColor ?? raw.selected_text_color));
  setIf('selectedDescriptionColor', getString(raw.selectedDescriptionColor ?? raw.selected_description_color));
  setIf('selectedBorderColor', getString(raw.selectedBorderColor ?? raw.selected_border_color));

  return theme as ReevitTheme;
}

/**
 * Maps backend response to PaymentIntent
 */
function mapToPaymentIntent(
  response: PaymentIntentResponse,
  config: ReevitCheckoutConfig
): PaymentIntent {
  const intent: PaymentIntent = {
    id: response.id,
    clientSecret: response.client_secret,
    pspPublicKey: response.psp_public_key,
    pspCredentials: response.psp_credentials,
    amount: response.amount,
    currency: response.currency,
    status: response.status as PaymentIntent['status'],
    recommendedPsp: mapProviderToPsp(response.provider),
    availableMethods: config.paymentMethods || ['card', 'mobile_money'],
    providerRefId: response.provider_ref_id,
    reference: response.reference || response.provider_ref_id || config.reference || response.id,
    orgId: response.org_id,
    connectionId: response.connection_id,
    provider: response.provider,
    feeAmount: response.fee_amount,
    feeCurrency: response.fee_currency,
    netAmount: response.net_amount,
    metadata: config.metadata,
    availableProviders: mapAvailableProviders(response.available_psps),
    branding: normalizeBranding(response.branding as Record<string, unknown> | undefined),
  };
  return intent;
}

/**
 * Creates a Svelte-compatible store for managing Reevit checkout state
 */
export function createReevitStore(options: CreateReevitStoreOptions) {
  const { config, onSuccess, onError, onClose, onStateChange, apiBaseUrl } = options;

  // Store state
  let state: ReevitState = createInitialState();
  let initRequestId = 0;

  // Guard against duplicate initialize() calls
  let initializing = false;
  let currentIntentKey: string | null = null;

  // Handle initial intent if provided
  if (config.initialPaymentIntent) {
    state = {
      ...state,
      status: 'ready',
      paymentIntent: config.initialPaymentIntent,
      selectedMethod:
        config.initialPaymentIntent.availableMethods?.length === 1
          ? config.initialPaymentIntent.availableMethods[0]
          : null,
    };
    initializing = true;
    currentIntentKey = `initial:${config.initialPaymentIntent.id}`;
  }

  let confirmation: Confirmation = 'idle';
  const subscribers = new Set<Subscriber<ReevitStoreState>>();

  // API client
  const apiClient = new ReevitAPIClient({
    publicKey: config.publicKey,
    baseUrl: apiBaseUrl,
  });

  // Notify subscribers
  const notify = () => {
    subscribers.forEach((subscriber) => subscriber({ ...state, confirmation }));
  };

  // Dispatch action
  const dispatch = (action: ReevitAction) => {
    const prevStatus = state.status;
    state = reevitReducer(state, action);
    notify();

    if (state.status !== prevStatus) {
      onStateChange?.(state.status);
    }
  };

  // Subscribe function for Svelte store contract
  const subscribe = (subscriber: Subscriber<ReevitStoreState>): Unsubscriber => {
    subscribers.add(subscriber);
    subscriber({ ...state, confirmation }); // Immediately call with current value
    return () => subscribers.delete(subscriber);
  };

  // Initialize payment intent. Resolves with the intent, or undefined when it could
  // not be created (the error is in the store state) or the request was superseded.
  const initialize = async (
    method?: PaymentMethod,
    options?: {
      preferredProvider?: string;
      allowedProviders?: string[];
      /** The payer's mobile money number. The provider pushes its prompt to it. */
      phone?: string;
      /** 0 for the first try; a retry after a failed prompt passes 1, 2, 3 to get a fresh intent. */
      attempt?: number;
    }
  ): Promise<PaymentIntent | undefined> => {
    if (config.initialPaymentIntent) {
      return state.paymentIntent ?? undefined;
    }

    let requestId = 0;
    let intentKey: string | null = null;

    try {
      const country = detectCountryFromCurrency(config.currency || 'GHS');
      const defaultMethod =
        config.paymentMethods && config.paymentMethods.length === 1
          ? config.paymentMethods[0]
          : undefined;
      const paymentMethod = method ?? defaultMethod;

      // A session selection gets its own identity so re-selecting the same method replays the first selection.
      const buyerPhone = options?.phone || undefined;
      const attempt = options?.attempt || 0;
      const variant = selectionVariant(buyerPhone, attempt);
      const selectionScope = [
        paymentMethod,
        options?.preferredProvider,
        ...(options?.allowedProviders ? [...options.allowedProviders].sort() : []),
        variant,
      ].filter(Boolean).join(':');
      const selectionProvider = options?.preferredProvider || options?.allowedProviders?.[0];
      const selectionIdempotencyKey = config.sessionSecret && paymentMethod && selectionProvider
        ? checkoutSelectionIdentity(config.sessionSecret, paymentMethod, selectionProvider, variant)
        : undefined;
      const identityConfig = selectionScope
        ? {
            ...config,
            phone: buyerPhone ?? config.phone,
            idempotencyKey: config.idempotencyKey
              ? `${config.idempotencyKey}:${selectionScope}`
              : selectionIdempotencyKey,
            // Only the intent cache key reads this (a retry must not reuse the failed intent);
            // createPaymentIntent never sends customFields.
            ...(attempt ? { customFields: { ...config.customFields, reevit_attempt: attempt } } : {}),
          }
        : config;

      const identity = resolveIntentIdentity({
        config: identityConfig,
        method: paymentMethod,
        preferredProvider: options?.preferredProvider,
        allowedProviders: options?.allowedProviders,
        publicKey: config.publicKey,
      });
      const { idempotencyKey, reference, cacheEntry } = identity;
      intentKey = idempotencyKey;

      if (currentIntentKey === idempotencyKey && state.paymentIntent) {
        return state.paymentIntent;
      }

      currentIntentKey = idempotencyKey;
      initializing = true;
      requestId = ++initRequestId;

      if (state.status !== 'loading') {
        dispatch({ type: 'INIT_START' });
      }

      const requestIntent = async (): Promise<PaymentIntentResponse> => {
        if (config.sessionSecret) {
          const result = paymentMethod && selectionProvider
            ? await selectCheckoutSession(
                config.sessionSecret,
                paymentMethod,
                selectionProvider,
                idempotencyKey,
                apiBaseUrl,
                buyerPhone,
                attempt,
              )
            : await apiClient.getCheckoutSession(config.sessionSecret);

          if (result.error) {
            throw result.error;
          }

          if (!result.data) {
            throw {
              code: 'INIT_FAILED',
              message: 'No checkout session data received from API',
              recoverable: true,
            } as PaymentError;
          }

          return result.data.payment_intent;
        }

        if (config.paymentLinkCode) {
          const response = await fetch(
            `${apiBaseUrl || DEFAULT_PUBLIC_API_BASE_URL}/v1/pay/${config.paymentLinkCode}/pay`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
              },
              body: JSON.stringify({
                amount: config.amount,
                email: config.email || '',
                name: config.customerName || '',
                phone: buyerPhone ?? config.phone ?? '',
                method: paymentMethod,
                country,
                provider: options?.preferredProvider || options?.allowedProviders?.[0],
                custom_fields: config.customFields,
              }),
            }
          );

          const responseData = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw buildPaymentLinkError(response, responseData);
          }
          return responseData as PaymentIntentResponse;
        }

        const result = await apiClient.createPaymentIntent(
          { ...identityConfig, reference, idempotencyKey },
          paymentMethod,
          country,
          {
            preferredProviders: options?.preferredProvider ? [options.preferredProvider] : undefined,
            allowedProviders: options?.allowedProviders,
          }
        );

        if (result.error) {
          throw result.error;
        }

        if (!result.data) {
          throw {
            code: 'INIT_FAILED',
            message: 'No data received from API',
            recoverable: true,
          } as PaymentError;
        }

        return result.data;
      };

      let data: PaymentIntentResponse;
      if (cacheEntry?.response) {
        data = cacheEntry.response;
      } else {
        let intentPromise = cacheEntry?.promise;
        if (!intentPromise) {
          intentPromise = requestIntent();
          cacheIntentPromise(idempotencyKey, intentPromise);
        }
        data = await intentPromise;
        cacheIntentResponse(idempotencyKey, data);
      }

      if (requestId !== initRequestId) {
        return;
      }

      const paymentIntent = mapToPaymentIntent(data, { ...config, reference, idempotencyKey });
      dispatch({ type: 'INIT_SUCCESS', payload: paymentIntent });
      // Don't reset initializing here - once initialized, stay initialized until reset()
      return paymentIntent;
    } catch (err) {
      if (intentKey) {
        clearIntentCacheEntry(intentKey);
      }
      if (requestId !== initRequestId) {
        return;
      }
      const error: PaymentError = typeof err === 'object' && err !== null && 'code' in err && 'message' in err
        ? (err as PaymentError)
        : {
          code: 'INIT_FAILED',
          message: err instanceof Error ? err.message : 'Failed to initialize checkout',
          recoverable: true,
          originalError: err,
        };
      dispatch({ type: 'INIT_ERROR', payload: error });
      onError?.(error);
      initializing = false;
    }
  };

  // Select payment method
  const selectMethod = (method: PaymentMethod) => {
    dispatch({ type: 'SELECT_METHOD', payload: method });
  };

  // Settling a provider's "success" can outlive the checkout; stop on reset or close.
  let settleController: AbortController | null = null;

  // Process payment after a PSP reports success.
  // The backend decides: only `succeeded` is a paid payment. A provider can say
  // "done" before its webhook lands. While the backend says pending the buyer sees
  // a calm "Confirming" state with no retry (they may already have been debited),
  // and the payment is never reported as success until it has succeeded.
  const processPayment = async (paymentData: Record<string, unknown>) => {
    const intent = state.paymentIntent;
    const method = state.selectedMethod;
    if (!intent || !method) {
      return;
    }

    dispatch({ type: 'PROCESS_START' });
    settleController?.abort();
    const controller = new AbortController();
    settleController = controller;

    const fail = (error: PaymentError) => {
      confirmation = 'idle';
      dispatch({ type: 'PROCESS_ERROR', payload: error });
      onError?.(error);
    };

    try {
      // Use the public confirm endpoint if a client secret is available
      const confirm = () =>
        intent.clientSecret
          ? apiClient.confirmPaymentIntent(intent.id, intent.clientSecret)
          : apiClient.confirmPayment(intent.id);

      const first = await confirm();
      if (controller.signal.aborted) return;

      if (first.error) {
        fail(first.error);
        return;
      }

      let confirmed = first.data;
      if (confirmed?.status !== 'succeeded' && !isPaymentFailure(confirmed?.status)) {
        confirmation = 'confirming';
        notify();
        onStateChange?.('confirming');
        const settled = await pollPaymentStatus({
          check: confirm,
          signal: controller.signal,
          intervalMs: CONFIRM_INTERVAL_MS,
          timeoutMs: CONFIRM_TIMEOUT_MS,
        });
        if (settled.kind === 'aborted') return;
        if (settled.kind === 'timeout') {
          // Not failed, not paid: leave it to the webhook. No retry, no onError, no onSuccess.
          confirmation = 'unconfirmed';
          notify();
          onStateChange?.('pending');
          return;
        }
        confirmation = 'idle';
        confirmed = settled.data;
      }

      if (confirmed?.status !== 'succeeded') {
        fail({
          code: 'PAYMENT_FAILED',
          message: 'The payment was not completed. Please try again.',
          recoverable: true,
        });
        return;
      }

      const result: PaymentResult = {
        paymentId: intent.id,
        reference: (paymentData.reference as string) ||
          (intent as PaymentIntent).reference ||
          (intent.metadata?.reference as string) || '',
        amount: intent.amount,
        currency: intent.currency,
        paymentMethod: method,
        psp: intent.recommendedPsp,
        pspReference: (paymentData.pspReference as string) ||
          (confirmed?.provider_ref_id as string) || '',
        status: 'success',
        metadata: { ...paymentData, backend_status: confirmed?.status },
      };

      dispatch({ type: 'PROCESS_SUCCESS', payload: result });
      onSuccess?.(result);
    } catch (err) {
      fail({
        code: 'PAYMENT_FAILED',
        message: err instanceof Error ? err.message : 'Payment failed',
        recoverable: true,
        originalError: err,
      });
    }
  };

  // Handle PSP success
  const handlePspSuccess = async (pspData: Record<string, unknown>) => {
    await processPayment(pspData);
  };

  // Handle PSP error
  const handlePspError = (error: PaymentError) => {
    dispatch({ type: 'PROCESS_ERROR', payload: error });
    onError?.(error);
  };

  // Reset checkout
  const reset = async () => {
    settleController?.abort();
    // Cancel the existing payment intent if it exists and is still pending, unless
    // the provider already said it was paid: that payment must be left to settle.
    if (state.paymentIntent && state.status !== 'success' && confirmation === 'idle') {
      try {
        await apiClient.cancelPaymentIntent(state.paymentIntent.id);
      } catch {
        // Silently ignore cancel errors
      }
    }

    confirmation = 'idle';
    initializing = false;
    currentIntentKey = null;
    initRequestId += 1;
    dispatch({ type: 'RESET' });
  };

  // Close checkout
  const close = async () => {
    settleController?.abort();
    // Leave a payment the provider already called paid to settle.
    if (state.paymentIntent && state.status !== 'success' && confirmation === 'idle') {
      try {
        await apiClient.cancelPaymentIntent(state.paymentIntent.id);
      } catch {
        // Silently ignore cancel errors
      }
    }

    confirmation = 'idle';
    dispatch({ type: 'CLOSE' });
    onClose?.();
  };

  // Derived getters
  const getStatus = () => state.status;
  const getPaymentIntent = () => state.paymentIntent;
  const getSelectedMethod = () => state.selectedMethod;
  const getError = () => state.error;
  const getResult = () => state.result;
  const isLoading = () => state.status === 'loading' || state.status === 'processing';
  const isReady = () => state.status === 'ready' || state.status === 'method_selected';
  const isComplete = () => state.status === 'success';
  const canRetry = () => state.error?.recoverable ?? false;

  return {
    // Svelte store contract
    subscribe,

    // Actions
    initialize,
    selectMethod,
    processPayment,
    handlePspSuccess,
    handlePspError,
    reset,
    close,
    /** Stop any in-flight confirmation. Call when the component using the store is destroyed. */
    dispose: () => settleController?.abort(),

    // Getters
    getStatus,
    getPaymentIntent,
    getSelectedMethod,
    getError,
    getResult,
    isLoading,
    isReady,
    isComplete,
    canRetry,
  };
}

export type ReevitStore = ReturnType<typeof createReevitStore>;
