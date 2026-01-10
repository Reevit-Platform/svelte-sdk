<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createReevitStore } from '../stores/reevit';
  import { createThemeVariables, cn, createReevitClient } from '@reevit/core';
  import type {
    ReevitTheme,
    PaymentIntent,
    PaymentResult,
    PaymentMethod,
    PSPType,
    CheckoutProviderOption,
  } from '@reevit/core';
  import ProviderSelector from './ProviderSelector.svelte';
  import PaymentMethodSelector from './PaymentMethodSelector.svelte';
  import MobileMoneyForm from './MobileMoneyForm.svelte';
  import {
    openPaystackPopup,
    openHubtelPopup,
    openFlutterwaveModal,
    openMonnifyModal,
    initiateMPesaSTKPush,
  } from '../bridges';

  type ReevitCheckoutEvents = {
    success: PaymentResult;
    error: { code: string; message: string };
    close: void;
  };

  const dispatch = createEventDispatcher<ReevitCheckoutEvents>();

  export let publicKey: string | undefined = undefined;
  export let amount: number;
  export let currency: string;
  export let email: string | undefined = undefined;
  export let phone: string | undefined = undefined;
  export let customerName: string | undefined = undefined;
  export let reference: string | undefined = undefined;
  export let metadata: Record<string, unknown> | undefined = undefined;
  export let customFields: Record<string, unknown> | undefined = undefined;
  export let paymentLinkCode: string | undefined = undefined;
  export let paymentMethods: ('card' | 'mobile_money' | 'bank_transfer')[] = ['card', 'mobile_money'];
  export let theme: ReevitTheme = {};
  export let isOpen: boolean = false;
  export let apiBaseUrl: string | undefined = undefined;
  export let initialPaymentIntent: PaymentIntent | undefined = undefined;
  let resolvedTheme: ReevitTheme = {};
  let selectedProvider: PSPType | null = null;
  let activeProvider: PSPType = 'paystack';
  let configuredMethods: PaymentMethod[] = ['card', 'mobile_money'];
  let providerOptions: CheckoutProviderOption[] = [];
  let availableMethods: PaymentMethod[] = configuredMethods;

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
    amount: number;
    currency: string;
    email: string | undefined;
    phone: string | undefined;
    customerName: string | undefined;
    reference: string | undefined;
    metadata: Record<string, unknown> | undefined;
    customFields: Record<string, unknown> | undefined;
    paymentLinkCode: string | undefined;
    paymentMethods: ('card' | 'mobile_money' | 'bank_transfer')[];
    initialPaymentIntent: PaymentIntent | undefined;
  }

  const store = createReevitStore({
    config: {
      publicKey,
      amount,
      currency,
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
    onSuccess: (result: PaymentResult) => dispatch('success', result),
    onError: (err: { code: string; message: string }) => dispatch('error', err),
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
  $: activeProvider = selectedProvider || state.paymentIntent?.recommendedPsp || 'paystack';
  $: configuredMethods = paymentMethods?.length ? paymentMethods : ['card', 'mobile_money'];
  $: providerOptions = (() => {
    const intent = state.paymentIntent;
    if (!intent) return [];
    const allowed = new Set(configuredMethods);
    const options = (intent.availableProviders || [])
      .map((provider) => {
        const sanitizedMethods = provider.provider.toLowerCase().includes('hubtel')
          ? provider.methods.filter((method) => method === 'card' || method === 'mobile_money')
          : provider.methods;

        return {
          ...provider,
          methods: sanitizedMethods.filter((method) => allowed.has(method)),
        };
      })
      .filter((provider) => provider.methods.length > 0);

    if (options.length > 0) return options;

    const fallbackMethods = intent.recommendedPsp.toLowerCase().includes('hubtel')
      ? configuredMethods.filter((method) => method === 'card' || method === 'mobile_money')
      : configuredMethods;

    return [
      {
        provider: intent.recommendedPsp,
        name: pspNames[intent.recommendedPsp] || intent.recommendedPsp,
        methods: fallbackMethods,
      },
    ];
  })();
  $: availableMethods = (() => {
    const option = providerOptions.find((provider) => provider.provider === activeProvider);
    return option?.methods.length ? option.methods : configuredMethods;
  })();

  $: if (providerOptions.length > 0) {
    // If we have a selected provider that's still valid, keep it
    if (selectedProvider && providerOptions.some((provider) => provider.provider === selectedProvider)) {
      // Keep it
    } else {
      // Only auto-select if there's exactly one provider
      if (providerOptions.length === 1) {
        selectedProvider = providerOptions[0].provider as PSPType;
      } else {
        selectedProvider = null;
      }
    }
  }

  $: if (state.selectedMethod && availableMethods.length > 0 && !availableMethods.includes(state.selectedMethod)) {
    store.selectMethod(availableMethods[0]);
  }

  // Reactive booleans for template - using store getters to avoid type narrowing
  $: storeIsLoading = store.isLoading();
  $: storeIsProcessing = store.getStatus() === 'processing';
  $: storeIsMethodSelected = store.getStatus() === 'method_selected';

  // Watch for intent and selected method to auto-advance
  $: if (isOpen && state.paymentIntent && state.selectedMethod) {
    const psp = (selectedProvider || state.paymentIntent.recommendedPsp || 'paystack').toLowerCase();
    const needsPhone = psp.includes('mpesa');

    // For card, auto-advance immediately if we have an intent
    if (state.selectedMethod === 'card') {
      handleProcessPayment(null);
    }
    // For mobile money, auto-advance only if we have phone if required
    else if (state.selectedMethod === 'mobile_money') {
      if (!needsPhone || (phone)) {
        handleProcessPayment(null);
      }
    }
  }

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

  function handleOpen(): void {
    isOpen = true;
    selectedProvider = null;
  }

  function handleClose(): void {
    isOpen = false;
    selectedProvider = null;
    store.close();
  }

  async function handleProcessPayment(data: { phone?: string } | null): Promise<void> {
    if (!state.paymentIntent) return;

    const currentPsp = activeProvider;

    try {
      switch (currentPsp) {
        case 'paystack': {
          await openPaystackPopup({
            key: state.paymentIntent.pspPublicKey ?? publicKey ?? '',
            email: email ?? '',
            amount,
            currency,
            ref: state.paymentIntent.id,
            onSuccess: (res) => store.handlePspSuccess(res),
            onClose: () => {},
          });
          break;
        }
        case 'hubtel': {
          const merchantAccount = state.paymentIntent.pspCredentials?.merchantAccount;
          const client = createReevitClient({ publicKey, baseUrl: apiBaseUrl });
          const { data: session, error: sessionError } = await client.createHubtelSession(
            state.paymentIntent.id,
            state.paymentIntent.clientSecret
          );
          if (sessionError || !session?.basicAuth) {
            dispatch('error', {
              code: sessionError?.code || 'hubtel_session_error',
              message: sessionError?.message || 'Failed to create Hubtel session',
            });
            return;
          }

          const hubtelPreferredMethod =
            state.selectedMethod === 'card' || state.selectedMethod === 'mobile_money'
              ? state.selectedMethod
              : undefined;

          await openHubtelPopup({
            clientId: (session.merchantAccount as string) || (typeof merchantAccount === 'string' ? merchantAccount : publicKey ?? ''),
            purchaseDescription: `Payment for ${amount} ${currency}`,
            amount,
            customerPhone: data?.phone ?? phone ?? '',
            customerEmail: email ?? '',
            basicAuth: session.basicAuth,
            preferredMethod: hubtelPreferredMethod,
            onSuccess: (res) => store.handlePspSuccess(res),
            onClose: () => {},
          });
          break;
        }
        case 'flutterwave': {
          await openFlutterwaveModal({
            public_key: state.paymentIntent.pspPublicKey ?? publicKey ?? '',
            tx_ref: state.paymentIntent.id,
            amount,
            currency,
            customer: {
              email: email ?? '',
              phone_number: data?.phone ?? phone ?? '',
            },
            callback: (res) => store.handlePspSuccess(res),
            onclose: () => {},
          });
          break;
        }
        case 'monnify': {
          const contractCode = metadata?.contract_code;
          const apiKey = state.paymentIntent.pspPublicKey ?? publicKey ?? '';
          const resolvedContractCode = (typeof contractCode === 'string' ? contractCode : publicKey ?? '');

          if (!apiKey || !resolvedContractCode) {
            store.handlePspError({
              code: 'MONNIFY_CONFIG_MISSING',
              message: 'Monnify configuration is missing. Please check your API key and contract code.',
            });
            return;
          }

          await openMonnifyModal({
            apiKey,
            contractCode: resolvedContractCode,
            amount,
            currency,
            reference: state.paymentIntent.reference ?? state.paymentIntent.id,
            customerName: (metadata?.customer_name as string) ?? email ?? '',
            customerEmail: email ?? '',
            customerPhone: data?.phone ?? phone ?? '',
            metadata: metadata as Record<string, string> | undefined,
            onSuccess: (res) => store.handlePspSuccess(res),
            onClose: () => {},
          });
          break;
        }
        case 'mpesa': {
          const baseUrl = apiBaseUrl ?? 'https://api.reevit.io';
          const apiEndpointUrl = `${baseUrl}/v1/payments/${state.paymentIntent.id}/mpesa`;
          await initiateMPesaSTKPush({
            phoneNumber: data?.phone ?? phone ?? '',
            amount,
            reference: state.paymentIntent.reference ?? state.paymentIntent.id,
            description: `Payment ${state.paymentIntent.reference ?? ''}`,
            onInitiated: () => {},
            onSuccess: (res) => store.handlePspSuccess(res),
            onError: (err) => store.handlePspError({ code: 'MPESA_ERROR', message: err.message }),
          }, apiEndpointUrl);
          break;
        }
        case 'stripe': {
          // Stripe requires Elements - for now, show a message that it needs custom integration
          store.handlePspError({
            code: 'STRIPE_NOT_IMPLEMENTED',
            message: 'Stripe integration requires custom Elements setup. Please use the React SDK or implement custom Stripe Elements.',
          });
          break;
        }
        default: {
          store.handlePspError({
            code: 'UNSUPPORTED_PSP',
            message: `Payment provider "${currentPsp}" is not supported in this checkout.`,
          });
        }
      }
    } catch (err) {
      store.handlePspError({
        code: 'BRIDGE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to open payment gateway',
      });
    }
  }

  function handleProviderSelect(provider: string) {
    // Toggle behavior - clicking same PSP collapses it
    if (provider === selectedProvider) {
      selectedProvider = null;
      store.reset();
      return;
    }

    const providerEntry = providerOptions.find((option) => option.provider === provider);
    const methods = providerEntry?.methods?.length ? providerEntry.methods : configuredMethods;
    const methodForInit =
      state.selectedMethod && methods.includes(state.selectedMethod) ? state.selectedMethod : methods[0];

    selectedProvider = provider as PSPType;
    store.reset();
    store.initialize(methodForInit, { preferredProvider: provider, allowedProviders: [provider] });
  }

  onMount(() => {
    // Initial initialization if isOpen is already true
    if (isOpen) {
      store.initialize();
    }
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });
</script>

<div class="reevit-sdk-container" style={Object.entries(themeVars).map(([k, v]) => `${k}:${v}`).join(';')}>
  <slot {handleOpen} isLoading={storeIsLoading}>
    <button
      type="button"
      class="reevit-pay-button"
      on:click={handleOpen}
      disabled={storeIsLoading}
    >
      {#if storeIsLoading}
        <span class="reevit-spinner"></span>
      {:else}
        <slot name="button-text">Pay Now</slot>
      {/if}
    </button>
  </slot>

  {#if isOpen}
    <div
      class="reevit-modal-overlay"
      role="button"
      tabindex="0"
      on:click={handleClose}
      on:keydown={(e: KeyboardEvent) => e.key === 'Escape' && handleClose()}
    >
      <div class={cn('reevit-modal-content', resolvedTheme.darkMode && 'reevit-modal--dark')}>
        <button class="reevit-modal-close" on:click={handleClose} aria-label="Close">
          &times;
        </button>

        <div class="reevit-modal-header">
          <div class="reevit-modal__branding">
            <img
              src={resolvedTheme.logoUrl || "https://i.imgur.com/bzUR5Lm.png"}
              alt={resolvedTheme.companyName || "Reevit"}
              class="reevit-modal__logo"
            />
            {#if resolvedTheme.companyName}
              <span class="reevit-modal__brand-name">{resolvedTheme.companyName}</span>
            {/if}
          </div>
        </div>

        <div class="reevit-modal-body">
          {#if state.status === 'loading'}
            <div class="reevit-loading-state">
              <div class="reevit-spinner reevit-spinner--large"></div>
              <p>Initializing payment...</p>
            </div>
          {:else if state.status === 'failed' && state.error}
            <div class="reevit-error-state">
              <div class="reevit-error-icon">⚠️</div>
              <h3>Payment Failed</h3>
              <p>{state.error.message}</p>
              <button class="reevit-retry-btn" on:click={() => store.initialize()}>Retry</button>
            </div>
          {:else if state.status === 'success'}
            <div class="reevit-success-state">
              <div class="reevit-success-icon">✅</div>
              <h3>Payment Successful</h3>
              <p>Thank you for your payment.</p>
              <button class="reevit-done-btn" on:click={handleClose}>Done</button>
            </div>
          {:else if state.status === 'ready' || storeIsMethodSelected}
            <div class="reevit-method-step reevit-animate-slide-up">
              {#if providerOptions.length > 1}
                <ProviderSelector
                  providers={providerOptions}
                  selectedProvider={selectedProvider}
                  disabled={storeIsLoading}
                  theme={resolvedTheme}
                  selectedMethod={state.selectedMethod}
                  on:select={(e) => handleProviderSelect(e.detail)}
                  on:methodSelect={(e) => store.selectMethod(e.detail)}
                >
                  <div slot="method-content" class="reevit-animate-fade-in">
                    {#if state.selectedMethod === 'card'}
                      <div class="reevit-inline-action">
                        <p class="reevit-inline-action__hint">
                          You'll be redirected to complete your card payment securely.
                        </p>
                        <button
                          class="reevit-btn reevit-btn--primary"
                          on:click={() => handleProcessPayment(null)}
                          disabled={storeIsProcessing}
                        >
                          Pay with Card
                        </button>
                      </div>
                    {:else if state.selectedMethod === 'mobile_money'}
                      <div class="reevit-inline-action">
                        {#if activeProvider.includes('mpesa') && !phone}
                          <MobileMoneyForm
                            initialPhone={phone}
                            loading={storeIsProcessing}
                            hideCancel
                            on:submit={(e) => handleProcessPayment(e.detail)}
                          />
                        {:else}
                          <p class="reevit-inline-action__hint">
                            {activeProvider.includes('hubtel')
                              ? 'Opens the Hubtel checkout with Mobile Money selected.'
                              : `Continue to pay securely with Mobile Money via ${pspNames[activeProvider] || activeProvider}.`}
                          </p>
                          <button
                            class="reevit-btn reevit-btn--primary"
                            on:click={() => handleProcessPayment(null)}
                            disabled={storeIsProcessing}
                          >
                            {activeProvider.includes('hubtel') ? 'Continue with Hubtel' : 'Pay with Mobile Money'}
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </ProviderSelector>
              {:else}
                <PaymentMethodSelector
                  methods={availableMethods}
                  selected={state.selectedMethod}
                  amount={amount}
                  currency={currency}
                  provider={activeProvider}
                  layout="grid"
                  showLabel={false}
                  on:select={(e) => store.selectMethod(e.detail as PaymentMethod)}
                />

                {#if storeIsMethodSelected}
                  <div class="reevit-method-step__actions reevit-animate-slide-up">
                    {#if state.selectedMethod === 'mobile_money' && activeProvider.includes('mpesa') && !phone}
                      <MobileMoneyForm
                        initialPhone={phone}
                        loading={storeIsProcessing}
                        on:submit={(e) => handleProcessPayment(e.detail)}
                        on:cancel={() => store.selectMethod(null as any)}
                      />
                    {:else}
                      <div class="reevit-card-info reevit-animate-fade-in">
                        <p class="reevit-info-text">
                          {state.selectedMethod === 'card' 
                            ? 'You will be redirected to complete your card payment securely.' 
                            : activeProvider.includes('hubtel')
                              ? 'Opens the Hubtel checkout with Mobile Money selected.'
                              : `Continue to pay securely via ${pspNames[activeProvider] || activeProvider}.`}
                        </p>
                        <button
                          class="reevit-submit-btn"
                          on:click={() => handleProcessPayment(null)}
                          disabled={storeIsProcessing}
                        >
                          {#if storeIsProcessing}
                            <span class="reevit-spinner"></span>
                          {:else}
                            <span>
                              {state.selectedMethod === 'card'
                                ? 'Pay with Card'
                                : activeProvider.includes('hubtel')
                                  ? 'Continue with Hubtel'
                                  : 'Pay with Mobile Money'}
                            </span>
                          {/if}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>

        <div class="reevit-modal-footer">
          <div class="reevit-trust-badges">
            <span>PCI DSS Compliant</span>
            <span>•</span>
            <span>SSL Secure</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Local styles if needed */
</style>
