/**
 * Reevit Svelte Store
 * Factory function to create a reactive checkout store for Svelte applications
 */

import {
  ReevitAPIClient,
  createInitialState,
  reevitReducer,
  generateReference,
  detectCountryFromCurrency,
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
} from '@reevit/core';

interface CreateReevitStoreOptions {
  config: ReevitCheckoutConfig;
  onSuccess?: (result: PaymentResult) => void;
  onError?: (error: PaymentError) => void;
  onClose?: () => void;
  onStateChange?: (state: CheckoutState) => void;
  apiBaseUrl?: string;
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
  return 'paystack';
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
    reference: response.reference || config.reference,
    connectionId: response.connection_id,
    provider: response.provider,
    feeAmount: response.fee_amount,
    feeCurrency: response.fee_currency,
    netAmount: response.net_amount,
    metadata: config.metadata,
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
  }

  const subscribers = new Set<Subscriber<ReevitState>>();

  // API client
  const apiClient = new ReevitAPIClient({
    publicKey: config.publicKey,
    baseUrl: apiBaseUrl,
  });

  // Notify subscribers
  const notify = () => {
    subscribers.forEach((subscriber) => subscriber(state));
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
  const subscribe = (subscriber: Subscriber<ReevitState>): Unsubscriber => {
    subscribers.add(subscriber);
    subscriber(state); // Immediately call with current value
    return () => subscribers.delete(subscriber);
  };

  // Initialize payment intent
  const initialize = async (method?: PaymentMethod) => {
    dispatch({ type: 'INIT_START' });

    try {
      const reference = config.reference || generateReference();
      const country = detectCountryFromCurrency(config.currency);
      const paymentMethod = method || config.paymentMethods?.[0] || 'card';

      const { data, error } = await apiClient.createPaymentIntent(
        { ...config, reference },
        paymentMethod,
        country
      );

      if (error) {
        dispatch({ type: 'INIT_ERROR', payload: error });
        onError?.(error);
        return;
      }

      if (!data) {
        const noDataError: PaymentError = {
          code: 'INIT_FAILED',
          message: 'No data received from API',
          recoverable: true,
        };
        dispatch({ type: 'INIT_ERROR', payload: noDataError });
        onError?.(noDataError);
        return;
      }

      const paymentIntent = mapToPaymentIntent(data, { ...config, reference });
      dispatch({ type: 'INIT_SUCCESS', payload: paymentIntent });
    } catch (err) {
      const error: PaymentError = {
        code: 'INIT_FAILED',
        message: err instanceof Error ? err.message : 'Failed to initialize checkout',
        recoverable: true,
        originalError: err,
      };
      dispatch({ type: 'INIT_ERROR', payload: error });
      onError?.(error);
    }
  };

  // Select payment method
  const selectMethod = (method: PaymentMethod) => {
    dispatch({ type: 'SELECT_METHOD', payload: method });
  };

  // Process payment after PSP success
  const processPayment = async (paymentData: Record<string, unknown>) => {
    if (!state.paymentIntent || !state.selectedMethod) {
      return;
    }

    dispatch({ type: 'PROCESS_START' });

    try {
      let resultData;

      // Use public confirm endpoint if client secret is available
      if (state.paymentIntent.clientSecret) {
        const { data, error } = await apiClient.confirmPaymentIntent(
          state.paymentIntent.id,
          state.paymentIntent.clientSecret
        );
        if (error) {
          dispatch({ type: 'PROCESS_ERROR', payload: error });
          onError?.(error);
          return;
        }
        resultData = data;
      } else {
        const { data, error } = await apiClient.confirmPayment(state.paymentIntent.id);
        if (error) {
          dispatch({ type: 'PROCESS_ERROR', payload: error });
          onError?.(error);
          return;
        }
        resultData = data;
      }

      const result: PaymentResult = {
        paymentId: state.paymentIntent.id,
        reference: (paymentData.reference as string) ||
          (state.paymentIntent as PaymentIntent).reference ||
          (state.paymentIntent.metadata?.reference as string) || '',
        amount: state.paymentIntent.amount,
        currency: state.paymentIntent.currency,
        paymentMethod: state.selectedMethod,
        psp: state.paymentIntent.recommendedPsp,
        pspReference: (paymentData.pspReference as string) ||
          (resultData?.provider_ref_id as string) || '',
        status: 'success',
        metadata: paymentData,
      };

      dispatch({ type: 'PROCESS_SUCCESS', payload: result });
      onSuccess?.(result);
    } catch (err) {
      const error: PaymentError = {
        code: 'PAYMENT_FAILED',
        message: err instanceof Error ? err.message : 'Payment failed',
        recoverable: true,
        originalError: err,
      };
      dispatch({ type: 'PROCESS_ERROR', payload: error });
      onError?.(error);
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
  const reset = () => {
    dispatch({ type: 'RESET' });
  };

  // Close checkout
  const close = async () => {
    if (state.paymentIntent && state.status !== 'success') {
      try {
        await apiClient.cancelPaymentIntent(state.paymentIntent.id);
      } catch {
        // Silently ignore cancel errors
      }
    }

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
