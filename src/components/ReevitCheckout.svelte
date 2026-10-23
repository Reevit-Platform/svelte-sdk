<script lang="ts">
  /**
   * ReevitCheckout
   * Main checkout component that orchestrates the payment flow.
   *
   * The shopper sees one list of payment methods. Reevit picks the processor:
   * the recommended one when it supports the chosen method, otherwise the first
   * connected one that does.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createReevitStore } from '../stores/reevit';
  import { toFlutterwaveAmount } from '../bridges/flutterwaveAmount';
  import { createThemeVariables, formatAmount } from '@reevit/core';
  import type {
    ReevitTheme,
    PaymentIntent,
    PaymentResult,
    PaymentMethod,
    PaymentError,
    MobileMoneyFormData,
  } from '@reevit/core';
  import type { CheckoutProvider, MethodOption } from '../types';
  import {
    createDirectCharge,
    FAILOVER_DONE,
    type DirectCharge,
    type DirectInput,
  } from '../direct/directCharge';
  import { createDirectBank, type DirectBank } from '../direct/directBank';
  import { createDirectChargeClient, type BankDetails, type PublicAttempt } from '../direct/api';
  import { NETWORK_LABEL, formatPayerPhone } from '../direct/format';
  import MobileMoneyForm from './MobileMoneyForm.svelte';
  import LoadingState from './LoadingState.svelte';
  import MethodList from './MethodList.svelte';
  import PanelHead from './PanelHead.svelte';
  import CheckoutShell from './CheckoutShell.svelte';
  import ReceiptPanel from './ReceiptPanel.svelte';
  import FailurePanel from './FailurePanel.svelte';
  import UnconfirmedPanel from './UnconfirmedPanel.svelte';
  import MPesaPanel from './MPesaPanel.svelte';
  import MomoWaitPanel from './MomoWaitPanel.svelte';
  import MomoCodePanel from './MomoCodePanel.svelte';
  import MomoFailurePanel from './MomoFailurePanel.svelte';
  import BankDetailsPanel from './BankDetailsPanel.svelte';
  import BankNotSeenPanel from './BankNotSeenPanel.svelte';
  import BankFailurePanel from './BankFailurePanel.svelte';
  import StripePanel from './StripePanel.svelte';
  import {
    openPaystackPopup,
    openHubtelPopup,
    openFlutterwaveModal,
    openMonnifyModal,
  } from '../bridges';
  import {
    METHOD_LABEL,
    METHOD_ORDER,
    PROVIDER_FOOTER,
    formatMoney,
    getCountryFromCurrency,
    titleCase,
    type FooterProvider,
  } from '../ledger';

  type ReevitCheckoutEvents = {
    success: PaymentResult;
    error: { code: string; message: string };
    close: void;
    /** Includes `confirming` and `pending` while a paid provider payment is unconfirmed. */
    stateChange: string;
  };

  const dispatch = createEventDispatcher<ReevitCheckoutEvents>();

  type Stage = 'list' | 'phone' | 'direct' | 'bank' | 'preparing' | 'bridge';
  type ViewId =
    | 'loading' | 'list' | 'phone' | 'preparing' | 'bridge' | 'processing' | 'confirming' | 'unconfirmed' | 'receipt' | 'failure'
    | 'momo' | 'momo-wait' | 'momo-code' | 'momo-fail'
    | 'bank-start' | 'bank' | 'bank-conf' | 'bank-miss' | 'bank-fail';

  /** A provider that takes a method in Reevit's own screens, with its capabilities. */
  interface DirectSelection {
    provider: CheckoutProvider;
    option: MethodOption;
  }

  function clearSuccessTimeout(): void {
    if (successTimeout) {
      clearTimeout(successTimeout);
      successTimeout = null;
    }
  }

  export let publicKey: string | undefined = undefined;
  /** Server-created checkout session secret. Prefer this over browser-created intents. */
  export let sessionSecret: string | undefined = undefined;
  /** Amount in the smallest currency unit. Required unless `sessionSecret` or `initialPaymentIntent` is given. */
  export let amount: number | undefined = undefined;
  /** Currency code. Required unless `sessionSecret` or `initialPaymentIntent` is given. */
  export let currency: string | undefined = undefined;
  /** Order-scoped key that makes intent creation safe to retry. */
  export let idempotencyKey: string | undefined = undefined;
  export let email: string | undefined = undefined;
  export let phone: string | undefined = undefined;
  export let customerName: string | undefined = undefined;
  export let reference: string | undefined = undefined;
  export let metadata: Record<string, unknown> | undefined = undefined;
  export let customFields: Record<string, unknown> | undefined = undefined;
  export let paymentLinkCode: string | undefined = undefined;
  export let paymentMethods: PaymentMethod[] = ['card', 'mobile_money'];
  export let theme: ReevitTheme = {};
  export let isOpen: boolean = false;
  export let apiBaseUrl: string | undefined = undefined;
  export let initialPaymentIntent: PaymentIntent | undefined = undefined;
  export let successDelayMs: number = 5000;

  let resolvedTheme: ReevitTheme = {};
  let successTimeout: ReturnType<typeof setTimeout> | null = null;

  // Flow state
  let stage: Stage = 'list';
  let momoData: MobileMoneyFormData | null = null;
  let selectedProvider: string | null = null;
  let pspError: PaymentError | null = null;
  let confirmLeave = false;
  let hubtelOpen = false;
  /** onSuccess is delivered exactly once per payment: by the timer, Done, or closing the receipt. */
  let successDelivered = false;
  /** Guards double taps while an intent is being created. */
  let picking = false;
  /** Bumped when the shopper backs out, so a stale intent response cannot reopen a provider window. */
  let pickToken = 0;
  /** Bumped whenever a provider window is left, so its late callbacks are ignored. */
  let bridgeToken = 0;
  let hubtelCheckout: { cancel: () => void } | null = null;
  /**
   * M-Pesa prompts sent in this checkout. The first is attempt 0; every later one
   * (a retry, or a corrected number) is a fresh intent, so it sends a fresh prompt
   * instead of replaying the failed one. The backend allows attempts 0 to 3.
   */
  let promptsSent = 0;
  /** The backend refuses a checkout-session selection past attempt 3. */
  const MAX_PROMPT_ATTEMPT = 3;

  const pspNames: Record<string, string> = {
    hubtel: 'Hubtel',
    paystack: 'Paystack',
    flutterwave: 'Flutterwave',
    monnify: 'Monnify',
    mpesa: 'M-Pesa',
    stripe: 'Stripe',
  };

  interface StoreConfig {
    publicKey: string | undefined;
    sessionSecret: string | undefined;
    amount: number | undefined;
    currency: string | undefined;
    idempotencyKey: string | undefined;
    email: string | undefined;
    phone: string | undefined;
    customerName: string | undefined;
    reference: string | undefined;
    metadata: Record<string, unknown> | undefined;
    customFields: Record<string, unknown> | undefined;
    paymentLinkCode: string | undefined;
    paymentMethods: PaymentMethod[];
    initialPaymentIntent: PaymentIntent | undefined;
  }

  function deliverSuccess(result: PaymentResult): void {
    clearSuccessTimeout();
    if (!successDelivered) {
      successDelivered = true;
      dispatch('success', result);
    }
    handleClose();
  }

  const store = createReevitStore({
    config: {
      publicKey,
      sessionSecret,
      amount,
      currency,
      idempotencyKey,
      email,
      phone,
      customerName,
      reference,
      metadata,
      customFields,
      paymentLinkCode,
      paymentMethods,
      initialPaymentIntent,
    } as StoreConfig,
    apiBaseUrl,
    onSuccess: (result: PaymentResult) => {
      successDelivered = false;
      clearSuccessTimeout();
      if (successDelayMs > 0) {
        successTimeout = setTimeout(() => {
          successTimeout = null;
          deliverSuccess(result);
        }, successDelayMs);
        return;
      }
      deliverSuccess(result);
    },
    onError: (err: { code: string; message: string }) => dispatch('error', err),
    onStateChange: (next: string) => dispatch('stateChange', next),
    onClose: () => {
      isOpen = false;
      dispatch('close');
    },
  });

  $: state = $store;
  $: resolvedTheme = {
    ...(state.paymentIntent?.branding || {}),
    ...(theme || {}),
  };
  $: themeVars = createThemeVariables(resolvedTheme);
  $: configuredMethods = (paymentMethods?.length ? paymentMethods : ['card', 'mobile_money']) as PaymentMethod[];

  $: providerOptions = ((): CheckoutProvider[] => {
    const intent = state.paymentIntent;
    const available = (intent?.availableProviders ?? []) as CheckoutProvider[];
    const fallbackProvider = intent?.recommendedPsp
      ? [{ provider: intent.recommendedPsp, name: titleCase(intent.recommendedPsp), methods: configuredMethods }]
      : [];
    const options = available.length > 0 ? available : fallbackProvider;

    return options
      .map((provider) => {
        const methods = provider.methods && provider.methods.length > 0 ? provider.methods : configuredMethods;
        const sanitizedMethods = provider.provider.toLowerCase().includes('hubtel')
          ? methods.filter((method) => method === 'card' || method === 'mobile_money')
          : methods;
        return { ...provider, methods: sanitizedMethods.filter((method) => configuredMethods.includes(method)) };
      })
      .filter((provider) => provider.methods.length > 0);
  })();

  $: displayAmount = state.paymentIntent?.amount ?? amount ?? 0;
  $: displayCurrency = state.paymentIntent?.currency ?? currency ?? 'GHS';

  /** The union of methods across every connected provider, in display order. */
  $: methodList = METHOD_ORDER.filter((method) => providerOptions.some((provider) => provider.methods.includes(method)));

  /** Reevit's routing choice for a method: the recommended provider if it supports it, else the first that does. */
  function providerFor(method: PaymentMethod): CheckoutProvider | undefined {
    const recommended = state.paymentIntent?.recommendedPsp?.toLowerCase();
    return (
      providerOptions.find((p) => p.provider.toLowerCase() === recommended && p.methods.includes(method)) ||
      providerOptions.find((p) => p.methods.includes(method))
    );
  }

  /**
   * Reevit's own screens take a method when a provider says `flow: direct` for it and
   * the checkout came from a server-created session (the charge route is keyed by the
   * session secret). Anything else keeps the provider's own window.
   */
  function pickDirect(
    method: PaymentMethod,
    secret: string | undefined,
    providers: CheckoutProvider[],
    recommendedPsp: string | undefined,
  ): DirectSelection | undefined {
    if (!secret || (method !== 'mobile_money' && method !== 'bank_transfer')) return undefined;
    const recommended = recommendedPsp?.toLowerCase();
    const candidates = providers
      .map((provider) => ({
        provider,
        option: provider.methodOptions?.find((o) => o.method === method && o.flow === 'direct'),
      }))
      .filter((c): c is DirectSelection => !!c.option);
    return candidates.find((c) => c.provider.provider.toLowerCase() === recommended) ?? candidates[0];
  }
  $: directSelection = pickDirect('mobile_money', sessionSecret, providerOptions, state.paymentIntent?.recommendedPsp);
  $: bankSelection = pickDirect('bank_transfer', sessionSecret, providerOptions, state.paymentIntent?.recommendedPsp);
  const directFor = (method: PaymentMethod): DirectSelection | undefined =>
    method === 'mobile_money' ? directSelection : method === 'bank_transfer' ? bankSelection : undefined;

  // The only method is mobile money: skip the list and ask for the number.
  $: soleMethod = methodList.length === 1 ? methodList[0] : null;
  $: soleProvider = soleMethod ? providerFor(soleMethod) : undefined;
  $: soleDirect = soleMethod === 'mobile_money' && !!directSelection;
  $: soleBank = soleMethod === 'bank_transfer' && !!bankSelection;
  $: directPhone = !soleDirect && soleMethod === 'mobile_money' && !!soleProvider?.provider.toLowerCase().includes('mpesa');
  $: activeStage = (stage === 'list' && soleDirect ? 'direct' : stage === 'list' && soleBank ? 'bank' : stage === 'list' && directPhone ? 'phone' : stage) as Stage;

  const directApi = createDirectChargeClient({ baseUrl: apiBaseUrl });
  /** "MTN MoMo · 024 412 8890", kept for the receipt only; the number is not handed to the merchant. */
  let receiptMethod: string | null = null;
  const chargeStore = createDirectCharge({
    api: directApi,
    sessionSecret,
    provider: '',
    onSuccess: (attempt: PublicAttempt, input: DirectInput | null) => {
      const label = input?.network ? NETWORK_LABEL[input.network] : undefined;
      receiptMethod = input && label ? `${label} · ${formatPayerPhone(input.phone)}` : null;
      store.completePayment({
        paymentId: attempt.id,
        reference: reference || '',
        amount: attempt.amount,
        currency: attempt.currency,
        paymentMethod: 'mobile_money',
        psp: directSelection?.provider.provider ?? attempt.provider_display ?? '',
        pspReference: attempt.id,
        status: 'success',
        metadata: { backend_status: attempt.status, rerouted: attempt.rerouted, receipt_url: attempt.receipt_url, network: input?.network },
      } as PaymentResult);
    },
    onFailure: (failure) =>
      dispatch('error', { code: failure.code, message: failure.message, recoverable: failure.retryable } as { code: string; message: string }),
  });
  const chargeActions = {
    start: chargeStore.start,
    check: chargeStore.check,
    resend: chargeStore.resend,
    submitCode: chargeStore.submitCode,
    useAnotherNumber: chargeStore.useAnotherNumber,
    retry: chargeStore.retry,
    reset: chargeStore.reset,
  };
  $: chargeStore.setOptions({ sessionSecret, provider: directSelection?.provider.provider ?? '' });
  $: charge = { ...$chargeStore, ...chargeActions } as DirectCharge;

  /** "Bank transfer · Wema Bank", kept for the receipt only. */
  let receiptBank: string | null = null;
  const bankStore = createDirectBank({
    api: directApi,
    sessionSecret,
    provider: '',
    onSuccess: (attempt: PublicAttempt, details: BankDetails | null) => {
      receiptBank = details?.bank ? `Bank transfer · ${details.bank}` : null;
      store.completePayment({
        paymentId: attempt.id,
        reference: reference || '',
        amount: attempt.amount,
        currency: attempt.currency,
        paymentMethod: 'bank_transfer',
        psp: bankSelection?.provider.provider ?? attempt.provider_display ?? '',
        pspReference: attempt.id,
        status: 'success',
        metadata: { backend_status: attempt.status, rerouted: attempt.rerouted, receipt_url: attempt.receipt_url },
      } as PaymentResult);
    },
    onFailure: (failure) =>
      dispatch('error', { code: failure.code, message: failure.message, recoverable: failure.retryable } as { code: string; message: string }),
  });
  const bankActions = {
    start: bankStore.start,
    sent: bankStore.sent,
    keepWaiting: bankStore.keepWaiting,
    newDetails: bankStore.newDetails,
    reset: bankStore.reset,
  };
  $: bankStore.setOptions({ sessionSecret, provider: bankSelection?.provider.provider ?? '' });
  $: bank = { ...$bankStore, ...bankActions } as DirectBank;
  const resetCharge = (): void => {
    chargeStore.reset();
    bankStore.reset();
  };
  // Closing from outside (a controlled `isOpen`) must also stop any prompt being followed.
  $: if (!isOpen) resetCharge();

  // Bank transfer asks for nothing from the shopper: the account is requested as soon as the screen opens.
  $: if (isOpen && activeStage === 'bank' && bank.phase === 'idle' && state.paymentIntent && !!bankSelection) void bankStore.start();

  // Theme
  $: brandName = resolvedTheme?.companyName;
  $: dataTheme = ((): 'light' | 'dark' | undefined => {
    const mode = resolvedTheme?.darkMode;
    if (typeof mode === 'boolean') {
      return mode ? 'dark' : 'light';
    }
    if (typeof document !== 'undefined') {
      if (document.documentElement.classList.contains('dark')) return 'dark';
      if (document.documentElement.classList.contains('light')) return 'light';
    }
    return undefined;
  })();
  // The Ledger palette is fixed, but a merchant-supplied button colour still drives the primary action.
  $: themeStyles = [
    resolvedTheme?.buttonBackgroundColor ? `--rv-cta-bg:${resolvedTheme.buttonBackgroundColor}` : '',
    resolvedTheme?.buttonTextColor ? `--rv-cta-fg:${resolvedTheme.buttonTextColor}` : '',
  ]
    .filter(Boolean)
    .join(';');

  $: psp = selectedProvider || state.paymentIntent?.recommendedPsp || 'paystack';
  $: pspLower = psp.toLowerCase();
  $: pspName = providerOptions.find((p) => p.provider.toLowerCase() === pspLower)?.name || titleCase(psp);
  $: country = getCountryFromCurrency(displayCurrency);
  // The merchant's own order reference. A backend reference that is only the payment/provider id is noise.
  $: intentRef = state.paymentIntent?.reference;
  $: orderRef =
    reference ||
    (intentRef && intentRef !== state.paymentIntent?.id && intentRef !== state.paymentIntent?.providerRefId
      ? intentRef
      : undefined);

  // Which view is on screen
  $: showFailure = (state.status === 'failed' && !!state.error) || !!pspError;
  $: view = ((): ViewId => {
    if (state.status === 'success' && state.result) return 'receipt';
    if (showFailure) return 'failure';
    if (state.confirmation === 'unconfirmed') return 'unconfirmed';
    if (state.confirmation === 'confirming') return 'confirming';
    if (state.status === 'processing') return 'processing';
    if (!state.paymentIntent) return 'loading';
    if (activeStage === 'bank') {
      return bank.phase === 'confirming'
        ? 'bank-conf'
        : bank.phase === 'notSeen'
          ? 'bank-miss'
          : bank.phase === 'failed' && bank.failure
            ? 'bank-fail'
            : (bank.phase === 'details' || bank.phase === 'expired') && bank.details
              ? 'bank'
              : 'bank-start';
    }
    if (activeStage === 'direct') {
      return charge.phase === 'waiting'
        ? 'momo-wait'
        : charge.phase === 'code' || charge.phase === 'submitting'
          ? 'momo-code'
          : charge.phase === 'failed' && charge.failure
            ? 'momo-fail'
            : 'momo';
    }
    if (activeStage === 'preparing') return 'preparing';
    if (activeStage === 'bridge') return 'bridge';
    if (activeStage === 'phone') return 'phone';
    return 'list';
  })();

  // Slide direction: forward into a detail panel, back to the list, fade otherwise.
  // Decided once per view so a later re-render never restarts the animation.
  // Waiting for the intent and showing the provider's own opening line are one panel to the eye.
  let lastPanelView: ViewId | null = null;
  let panelDirection: 'forward' | 'back' | 'fade' = 'fade';
  function directionFor(next: ViewId): 'forward' | 'back' | 'fade' {
    if (lastPanelView === null) {
      lastPanelView = next;
      return 'fade';
    }
    if (lastPanelView !== next) {
      const from = lastPanelView;
      const isDetail = (v: ViewId) =>
        v === 'phone' || v === 'preparing' || v === 'bridge' || v === 'momo' || v === 'bank-start' || v === 'bank';
      const isPrompt = (v: ViewId) =>
        v === 'momo-wait' || v === 'momo-code' || v === 'momo-fail' || v === 'bank-conf' || v === 'bank-miss' || v === 'bank-fail';
      panelDirection =
        (next === 'list' && (isDetail(from) || isPrompt(from))) || ((next === 'momo' || next === 'bank') && isPrompt(from))
          ? 'back'
          : isDetail(next) && from === 'list'
            ? 'forward'
            : 'fade';
      lastPanelView = next;
    }
    return panelDirection;
  }
  $: panelView = (view === 'preparing' ? 'bridge' : view) as ViewId;
  $: direction = directionFor(panelView);

  // A payment is in flight while a provider window is open or the result is being confirmed.
  $: inFlight =
    view === 'bridge' || view === 'processing' || view === 'momo-wait' || view === 'momo-code' ||
    (view === 'bank' && bank.phase !== 'expired') || view === 'bank-conf' || view === 'bank-miss';
  // The confirmation only makes sense while a payment is still in flight.
  $: if (confirmLeave && !inFlight) confirmLeave = false;

  $: footerProvider = ((): FooterProvider | null => {
    const recommended = state.paymentIntent?.recommendedPsp?.toLowerCase();
    const id = (
      selectedProvider ||
      providerOptions.find((p) => p.provider.toLowerCase() === recommended)?.provider ||
      providerOptions[0]?.provider ||
      ''
    ).toLowerCase();
    const mark = PROVIDER_FOOTER[id];
    if (!mark?.src) return null;
    return { id, name: titleCase(id), src: mark.src, kind: mark.kind };
  })();

  $: methodLabel = state.selectedMethod ? METHOD_LABEL[state.selectedMethod] : 'Payment';
  $: amountText = formatMoney(displayAmount, displayCurrency);
  $: announce = {
    loading: 'Preparing checkout',
    list: 'Choose a payment method',
    phone: 'Mobile money',
    momo: 'Mobile money',
    'momo-wait': 'Waiting for your approval',
    'momo-code': 'Enter your code',
    'momo-fail': charge.failure?.title ?? 'Payment failed',
    'bank-start': 'Getting account details',
    bank: bank.phase === 'expired' ? 'Account details expired' : 'Bank transfer',
    'bank-conf': 'Confirming your transfer',
    'bank-miss': 'We haven’t seen it yet',
    'bank-fail': bank.failure?.title ?? 'Payment failed',
    preparing: `Opening ${pspName}`,
    bridge: `Opening ${pspName}`,
    processing: 'Processing payment',
    confirming: 'Confirming your payment',
    unconfirmed: 'Still confirming this payment',
    receipt: 'Payment received',
    failure: 'Payment failed',
  }[view];

  $: if (isOpen) {
    document.body.style.overflow = 'hidden';
    if (!state.paymentIntent && state.status === 'idle') {
      store.initialize();
    }
  } else {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  function resetFlow(): void {
    pickToken += 1;
    leaveBridge();
    stage = 'list';
    momoData = null;
    selectedProvider = null;
    pspError = null;
    confirmLeave = false;
    resetCharge();
  }

  function handleOpen(): void {
    isOpen = true;
    resetFlow();
  }

  function handleClose(): void {
    clearSuccessTimeout();
    resetFlow();
    isOpen = false;
    store.close();
  }

  /** Stop listening to the provider window that is open (if any). */
  function leaveBridge(): void {
    bridgeToken += 1;
    hubtelOpen = false;
    hubtelCheckout?.cancel();
    hubtelCheckout = null;
  }

  /**
   * Create (or reuse) a method-specific intent, then hand off to the provider.
   *
   * Paystack's resumeTransaction() can only reopen the transaction represented
   * by its access code; it cannot change that transaction's payment channels.
   * The first intent is created before the shopper picks a method so that the
   * widget can show what is available. Create/reuse a method-specific intent
   * before opening the provider, otherwise Paystack defaults that first intent
   * to card even when the shopper picked Mobile Money.
   */
  async function proceed(
    method: PaymentMethod,
    provider: CheckoutProvider,
    buyer?: { phone: string; attempt: number },
  ): Promise<void> {
    if (picking) return;
    picking = true;
    const token = ++pickToken;

    selectedProvider = provider.provider;
    store.selectMethod(method);
    stage = 'preparing';

    try {
      if (!initialPaymentIntent) {
        const intent = await store.initialize(method, {
          allowedProviders: [provider.provider],
          phone: buyer?.phone,
          attempt: buyer?.attempt,
        });
        if (token !== pickToken) return;
        if (!intent) {
          stage = 'list';
          return;
        }
        // A fresh intent starts with no method; keep the shopper's pick.
        store.selectMethod(method);
      }
      stage = 'bridge';
      void openProvider(provider.provider.toLowerCase(), method);
    } finally {
      picking = false;
    }
  }

  // A row was tapped: route to a provider and carry on.
  function handlePick(method: PaymentMethod): void {
    if (picking) return;
    const provider = providerFor(method);
    if (!provider) {
      dispatch('error', {
        code: 'UNSUPPORTED_CHECKOUT_SELECTION',
        message: 'No connected provider supports this payment method.',
        recoverable: true,
      } as { code: string; message: string });
      return;
    }

    const direct = directFor(method);
    if (direct && method === 'bank_transfer') {
      // Reevit's own screens: the account appears at once. A live account is shown again, never replaced.
      selectedProvider = direct.provider.provider;
      store.selectMethod(method);
      stage = 'bank';
      return;
    }
    if (direct) {
      // Reevit's own screens: the number first, then the prompt. An earlier prompt keeps being watched.
      selectedProvider = direct.provider.provider;
      store.selectMethod(method);
      chargeStore.useAnotherNumber();
      stage = 'direct';
      return;
    }

    if (method === 'mobile_money' && provider.provider.toLowerCase().includes('mpesa')) {
      // M-Pesa is the one in-widget mobile money flow: ask for the number first.
      selectedProvider = provider.provider;
      store.selectMethod(method);
      stage = 'phone';
      return;
    }

    void proceed(method, provider);
  }

  // Mobile money number submitted (M-Pesa)
  function handleMomoSubmit(data: MobileMoneyFormData): void {
    const provider = providerFor('mobile_money');
    if (!provider) return;
    const attempt = promptsSent;
    if (attempt > MAX_PROMPT_ATTEMPT) {
      dispatch('error', {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts. Please close this window and start again.',
        recoverable: false,
      } as { code: string; message: string });
      return;
    }
    promptsSent += 1;
    momoData = data;
    void proceed('mobile_money', provider, { phone: data.phone, attempt });
  }

  // Mobile money number submitted on Reevit's own form.
  function handleDirectSubmit(data: MobileMoneyFormData): void {
    const networks = directSelection?.option.networks ?? [];
    void chargeStore.start({ phone: data.phone, network: networks.includes(data.network) ? data.network : undefined });
  }

  function handlePSPSuccess(pspResult: Record<string, unknown>): void {
    void store.handlePspSuccess(pspResult);
  }

  // A provider window failed outright: report it and show the failure panel.
  function handlePSPError(err: PaymentError): void {
    pickToken += 1;
    leaveBridge();
    stage = 'list';
    pspError = err;
    dispatch('error', err);
  }

  // The provider window was dismissed: back to the list.
  function handlePSPClose(): void {
    pickToken += 1;
    leaveBridge();
    stage = 'list';
  }

  // Back chevron on a detail panel
  function handlePanelBack(): void {
    pickToken += 1;
    // Leaving mobile money mid-prompt: back to a clean form, the prompt still watched.
    chargeStore.useAnotherNumber();
    leaveBridge();
    stage = 'list';
    selectedProvider = null;
  }

  // "Try again" on the failure panel
  async function handleBack(): Promise<void> {
    pickToken += 1;
    leaveBridge();
    pspError = null;
    momoData = null;
    stage = 'list';
    selectedProvider = null;
    if (store.getStatus() === 'failed') {
      await store.reset();
      // A checkout that never loaded has nothing to go back to; load it again.
      if (!store.getPaymentIntent() && !initialPaymentIntent) {
        await store.initialize();
      }
    }
  }

  function finishReceipt(): void {
    if (state.result) deliverSuccess(state.result);
  }

  function requestClose(): void {
    if (view === 'receipt') {
      finishReceipt();
      return;
    }
    if (inFlight) {
      confirmLeave = true;
      return;
    }
    handleClose();
  }

  /**
   * Open the provider's own window. Card, bank and wallet details stay there.
   * M-Pesa and Stripe render inside the dialog instead, so they open nothing here.
   */
  async function openProvider(provider: string, method: PaymentMethod): Promise<void> {
    const intent = state.paymentIntent ?? store.getPaymentIntent();
    if (!intent) return;
    const token = bridgeToken;
    const live = () => token === bridgeToken;
    const phoneNumber = momoData?.phone || phone;
    const bridgeMetadata = {
      ...metadata,
      org_id: intent.orgId ?? (metadata?.org_id as string),
      payment_id: intent.id,
      connection_id: intent.connectionId ?? (metadata?.connection_id as string),
      customer_phone: phoneNumber,
    };

    try {
      switch (provider) {
        case 'paystack': {
          await openPaystackPopup({
            key: intent.pspPublicKey ?? publicKey ?? '',
            email: email ?? '',
            phone: phoneNumber,
            amount: displayAmount,
            currency: displayCurrency,
            ref: intent.id,
            accessCode: intent.clientSecret,
            channels: method === 'mobile_money' ? ['mobile_money'] : ['card'],
            metadata: bridgeMetadata,
            onSuccess: (res) => handlePSPSuccess(res),
            onClose: () => live() && handlePSPClose(),
            onError: (err) =>
              live() &&
              handlePSPError({
                code: 'PSP_ERROR',
                message: err?.message || 'Paystack checkout failed',
                recoverable: true,
                originalError: err,
              }),
          });
          break;
        }
        case 'hubtel': {
          // Opens the hosted checkout the Reevit API created; no Hubtel
          // credentials are used in the browser.
          hubtelCheckout?.cancel();
          hubtelCheckout = await openHubtelPopup({
            paymentId: intent.id,
            clientSecret: intent.clientSecret,
            publicKey,
            apiBaseUrl,
            clientReference: intent.providerRefId || intent.reference || intent.id,
            onOpen: () => {
              if (live()) hubtelOpen = true;
            },
            onSuccess: (res) => handlePSPSuccess(res),
            onError: (err) => live() && handlePSPError(err as PaymentError),
            onClose: () => live() && handlePSPClose(),
          });
          if (!live()) {
            hubtelCheckout?.cancel();
            hubtelCheckout = null;
          }
          break;
        }
        case 'flutterwave': {
          await openFlutterwaveModal({
            public_key: intent.pspPublicKey ?? publicKey ?? '',
            tx_ref: intent.id,
            amount: toFlutterwaveAmount(displayAmount, displayCurrency),
            currency: displayCurrency,
            customer: {
              email: email ?? '',
              phone_number: phoneNumber ?? '',
            },
            meta: bridgeMetadata,
            callback: (res) => handlePSPSuccess(res),
            onclose: () => live() && handlePSPClose(),
          });
          break;
        }
        case 'monnify': {
          const contractCode = metadata?.contract_code;
          const apiKey = intent.pspPublicKey ?? publicKey ?? '';
          const resolvedContractCode = typeof contractCode === 'string' ? contractCode : publicKey ?? '';

          if (!apiKey || !resolvedContractCode) {
            handlePSPError({
              code: 'MONNIFY_CONFIG_MISSING',
              message: 'Monnify configuration is missing. Please check your API key and contract code.',
              recoverable: true,
            });
            return;
          }

          await openMonnifyModal({
            apiKey,
            contractCode: resolvedContractCode,
            amount: displayAmount,
            currency: displayCurrency,
            reference: intent.reference ?? intent.id,
            customerName: (metadata?.customer_name as string) ?? email ?? '',
            customerEmail: email ?? '',
            customerPhone: phoneNumber ?? '',
            metadata: metadata as Record<string, string> | undefined,
            onSuccess: (res) => handlePSPSuccess(res),
            onClose: () => live() && handlePSPClose(),
          });
          break;
        }
        default:
          // M-Pesa and Stripe render their own panels; anything else is shown as unsupported.
          break;
      }
    } catch (err) {
      if (!live()) return;
      handlePSPError({
        code: 'BRIDGE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to open payment gateway',
        recoverable: true,
        originalError: err,
      });
    }
  }

  /**
   * Mirrors the core client's guard, but locally so a misconfigured checkout reports
   * itself before the shopper has clicked anything.
   */
  function hasChargeableConfig(): boolean {
    return (
      Boolean(sessionSecret) ||
      Boolean(initialPaymentIntent) ||
      Boolean(paymentLinkCode) ||
      (typeof amount === 'number' && Boolean(currency))
    );
  }

  onMount(() => {
    if (!hasChargeableConfig()) {
      dispatch('error', {
        code: 'invalid_checkout_config',
        message: 'amount and currency are required when creating a payment intent in the browser.',
      });
      return;
    }

    // Initial initialization if isOpen is already true
    if (isOpen) {
      store.initialize();
    }
  });

  onDestroy(() => {
    store.dispose();
    chargeStore.destroy();
    bankStore.destroy();
    leaveBridge();
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    clearSuccessTimeout();
  });
</script>

<div class="reevit-sdk-container" style={Object.entries(themeVars).map(([k, v]) => `${k}:${v}`).join(';')}>
  <slot {handleOpen} isLoading={store.isLoading()}>
    <button type="button" class="reevit-pay-button" on:click={handleOpen} disabled={store.isLoading()}>
      {#if store.isLoading()}
        <span class="reevit-spinner"></span>
      {:else}
        <slot name="button-text">Pay Now</slot>
      {/if}
    </button>
  </slot>

  {#if isOpen}
    <CheckoutShell
      theme={dataTheme}
      style={themeStyles || undefined}
      brandName={brandName || 'Checkout'}
      hasBrandName={!!brandName}
      logoUrl={resolvedTheme?.logoUrl}
      {amountText}
      {orderRef}
      {footerProvider}
      viewKey={panelView}
      {announce}
      confirmOpen={confirmLeave}
      onRequestClose={requestClose}
      onStay={() => (confirmLeave = false)}
      onLeave={handleClose}
    >
      {#key panelView}
        <div class="reevit-panel reevit-panel--{direction}" data-reevit="panel" data-step={panelView}>
          {#if view === 'loading'}
            <LoadingState title="Preparing checkout" />
          {:else if view === 'confirming'}
            <LoadingState title="Confirming your payment" message="This can take a minute. You don’t need to pay again." />
          {:else if view === 'unconfirmed'}
            <UnconfirmedPanel onDone={handleClose} />
          {:else if view === 'processing'}
            <LoadingState title="Processing payment" message="Please don’t close this window." />
          {:else if view === 'receipt' && state.result}
            <ReceiptPanel
              reference={state.result.reference || state.result.paymentId}
              method={(state.result.paymentMethod === 'mobile_money' && receiptMethod) || (state.result.paymentMethod === 'bank_transfer' && receiptBank) || METHOD_LABEL[state.result.paymentMethod] || methodLabel}
              provider={providerOptions.find((p) => p.provider.toLowerCase() === (selectedProvider || state.result?.psp || '').toLowerCase())?.name ||
                titleCase(selectedProvider || state.result.psp || pspName)}
              merchantName={brandName || 'Checkout'}
              {orderRef}
              {amountText}
              note={state.result.metadata?.rerouted === true ? FAILOVER_DONE : undefined}
              onDone={finishReceipt}
            />
          {:else if view === 'failure'}
            <FailurePanel
              title={state.paymentIntent ? 'Payment failed' : 'Couldn’t start checkout'}
              message={pspError?.message || state.error?.message || 'Something went wrong. Please try again.'}
              onRetry={handleBack}
            />
          {:else if view === 'phone'}
            <PanelHead title="Mobile money" onBack={directPhone ? undefined : handlePanelBack} />
            <MobileMoneyForm
              mode="mpesa"
              initialPhone={momoData?.phone || phone}
              submitLabel={`Pay ${amountText}`}
              hideCancel
              on:submit={(e) => handleMomoSubmit(e.detail)}
            />
          {:else if view === 'momo'}
            {@const option = directSelection?.option}
            {@const mpesaMode = option ? option.networks.length === 1 && option.networks[0] === 'mpesa' : displayCurrency === 'KES'}
            <PanelHead title="Mobile money" onBack={soleDirect ? undefined : handlePanelBack} />
            <MobileMoneyForm
              mode={mpesaMode ? 'mpesa' : 'network'}
              networks={mpesaMode ? undefined : option?.networks}
              initialPhone={charge.input?.phone || momoData?.phone || phone}
              submitLabel={`Pay ${amountText}`}
              hideCancel
              loading={charge.phase === 'starting'}
              notice={charge.formNotice}
              on:submit={(e) => handleDirectSubmit(e.detail)}
            />
          {:else if view === 'momo-wait'}
            <MomoWaitPanel
              {charge}
              phoneText={charge.input ? formatPayerPhone(charge.input.phone) : charge.attempt?.next_action?.phone_masked ?? ''}
              network={charge.input?.network ?? charge.attempt?.next_action?.network ?? (displayCurrency === 'KES' ? 'mpesa' : undefined)}
            />
          {:else if view === 'momo-code'}
            {#key `${charge.attempt?.id}:${charge.codeKind}`}
              <MomoCodePanel {charge} />
            {/key}
          {:else if view === 'momo-fail'}
            {#if charge.failure}
              <MomoFailurePanel
                {charge}
                failure={charge.failure}
                canChooseAnother={methodList.length > 1}
                onChooseAnother={handlePanelBack}
                onClose={handleClose}
              />
            {/if}
          {:else if view === 'bank-start'}
            <PanelHead title="Bank transfer" onBack={soleBank ? undefined : handlePanelBack} />
            <LoadingState variant="line" title="Getting account details…" />
          {:else if view === 'bank'}
            {#if bank.details}
              <BankDetailsPanel
                {bank}
                details={bank.details}
                currency={displayCurrency}
                amountText={formatMoney(bank.details.amount || displayAmount, displayCurrency)}
                onBack={soleBank ? undefined : handlePanelBack}
              />
            {/if}
          {:else if view === 'bank-conf'}
            <LoadingState title="Confirming your transfer" message="This usually takes a moment." />
          {:else if view === 'bank-miss'}
            <BankNotSeenPanel {bank} />
          {:else if view === 'bank-fail'}
            {#if bank.failure}
              <BankFailurePanel
                {bank}
                failure={bank.failure}
                canChooseAnother={methodList.length > 1}
                onChooseAnother={handlePanelBack}
                onClose={handleClose}
              />
            {/if}
          {:else if view === 'preparing'}
            {#if pspLower !== 'mpesa'}<PanelHead title={methodLabel} onBack={handlePanelBack} />{/if}
            <LoadingState variant="line" title={`Opening ${pspName}…`} />
          {:else if view === 'bridge'}
            <!-- M-Pesa's own waiting/failed panels carry the heading and the way back. -->
            {#if pspLower !== 'mpesa'}<PanelHead title={methodLabel} onBack={handlePSPClose} />{/if}
            {#if pspLower === 'mpesa'}
              <!-- A new payment is a new prompt: start its poll from scratch. -->
              {#key state.paymentIntent?.id}
                <MPesaPanel
                  paymentId={state.paymentIntent?.id ?? ''}
                  clientSecret={state.paymentIntent?.clientSecret}
                  {publicKey}
                  {apiBaseUrl}
                  phoneNumber={momoData?.phone || phone || ''}
                  reference={state.paymentIntent?.reference ?? state.paymentIntent?.id}
                  onSuccess={(res) => handlePSPSuccess(res)}
                  onError={(err) => dispatch('error', err)}
                  onRetry={momoData ? () => handleMomoSubmit(momoData!) : undefined}
                  onChangeNumber={() => (stage = 'phone')}
                />
              {/key}
            {:else if pspLower === 'stripe'}
              <StripePanel
                publishableKey={state.paymentIntent?.pspPublicKey ?? publicKey ?? ''}
                clientSecret={state.paymentIntent?.clientSecret || ''}
                amount={displayAmount}
                currency={displayCurrency}
                dark={dataTheme === 'dark'}
                onSuccess={(res) => handlePSPSuccess(res)}
                onError={(err) => {
                  // Card typos are shown inline by the panel; only a failed load replaces the form.
                  if (err.code === 'STRIPE_INIT_ERROR' || err.code === 'NOT_INITIALIZED') {
                    handlePSPError({ ...err, recoverable: true });
                  } else {
                    dispatch('error', err);
                  }
                }}
              />
            {:else if pspLower === 'hubtel'}
              <LoadingState variant="line" title={hubtelOpen ? 'Complete your payment with Hubtel' : 'Opening Hubtel…'} />
            {:else if pspLower === 'paystack' || pspLower === 'flutterwave' || pspLower === 'monnify'}
              <LoadingState variant="line" title={`Opening ${pspName}…`} />
            {:else}
              <div class="reevit-result" data-reevit="failure">
                <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
                  <span class="reevit-fail-dot" aria-hidden="true"></span>Provider not supported
                </h2>
                <p class="reevit-text">{psp} is not supported.</p>
                <button type="button" class="reevit-cta" data-reevit="cta" data-first="" on:click={handlePanelBack}>Go back</button>
              </div>
            {/if}
          {:else}
            <MethodList methods={methodList} {country} onPick={handlePick} />
          {/if}
        </div>
      {/key}
    </CheckoutShell>
  {/if}
</div>
