<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createReevitStore } from '../stores/reevit';
  import { createThemeVariables, cn, createReevitClient, detectCountryFromCurrency, formatAmount } from '@reevit/core';
  import type {
    ReevitTheme,
    PaymentIntent,
    PaymentResult,
    PaymentMethod,
    PSPType,
    CheckoutProviderOption,
  } from '@reevit/core';
  import MobileMoneyForm from './MobileMoneyForm.svelte';
  import LoadingState from './LoadingState.svelte';
  import {
    openPaystackPopup,
    openHubtelPopup,
    openFlutterwaveModal,
    openMonnifyModal,
    initiateMPesaSTKPush,
  } from '../bridges';

  import flutterwaveLogo from '../assets/providers/flutterwave.png';
  import hubtelLogo from '../assets/providers/hubtel.png';
  import monnifyLogo from '../assets/providers/monnify.png';
  import mpesaLogo from '../assets/providers/mpesa.png';
  import paystackLogo from '../assets/providers/paystack.png';
  import stripeLogo from '../assets/providers/stripe.png';

  /** PSP brand logos, keyed by provider id. */
  const PROVIDER_LOGOS: Record<string, string | undefined> = {
    paystack: paystackLogo,
    hubtel: hubtelLogo,
    flutterwave: flutterwaveLogo,
    monnify: monnifyLogo,
    mpesa: mpesaLogo,
    stripe: stripeLogo,
  };

  /** Short terminal-style code per payment method, used in the `NN / CODE` id line. */
  const METHOD_CODE: Record<PaymentMethod, string> = {
    card: 'CARD',
    mobile_money: 'MOMO',
    bank_transfer: 'BANK',
    apple_pay: 'APAY',
    google_pay: 'GPAY',
  };

  const METHOD_NAME: Record<PaymentMethod, string> = {
    card: 'CARD',
    mobile_money: 'MOBILE MONEY',
    bank_transfer: 'BANK TRANSFER',
    apple_pay: 'APPLE PAY',
    google_pay: 'GOOGLE PAY',
  };

  type ReevitCheckoutEvents = {
    success: PaymentResult;
    error: { code: string; message: string };
    close: void;
  };

  const dispatch = createEventDispatcher<ReevitCheckoutEvents>();

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
  let selectedTheme:
    | {
        backgroundColor?: string;
        textColor?: string;
        descriptionColor?: string;
        borderColor?: string;
      }
    | undefined = undefined;
  let fallbackCountry: string = 'GH';
  let successTimeout: ReturnType<typeof setTimeout> | null = null;
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
      clearSuccessTimeout();
      if (successDelayMs <= 0) {
        dispatch('success', result);
        handleClose();
        return;
      }
      successTimeout = setTimeout(() => {
        dispatch('success', result);
        handleClose();
        successTimeout = null;
      }, successDelayMs);
    },
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
  $: selectedTheme = {
    backgroundColor: resolvedTheme.selectedBackgroundColor,
    textColor: resolvedTheme.selectedTextColor,
    descriptionColor: resolvedTheme.selectedDescriptionColor,
    borderColor: resolvedTheme.selectedBorderColor,
  };
  $: fallbackCountry = detectCountryFromCurrency(displayCurrency);
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

  // Brutalist display derivations
  $: displayAmount = state.paymentIntent?.amount ?? amount ?? 0;
  $: displayCurrency = state.paymentIntent?.currency ?? currency ?? 'GHS';
  $: brandName = resolvedTheme?.companyName;
  $: dataTheme = (() => {
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
  $: themeStyles = (() => {
    const vars: Record<string, string> = {};
    if (resolvedTheme?.buttonBackgroundColor) {
      vars['--rb-accent'] = resolvedTheme.buttonBackgroundColor;
    }
    if (resolvedTheme?.buttonTextColor) {
      vars['--rb-accent-text'] = resolvedTheme.buttonTextColor;
    }
    return Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
  })();
  $: activeProviderId = activeProvider;
  $: needsMomoForm =
    state.selectedMethod === 'mobile_money' && activeProvider.toLowerCase().includes('mpesa') && !phone;

  // CTA handler — routes the chosen method/provider into the PSP bridge.
  function handleContinue(): void {
    if (!state.selectedMethod) return;
    void handleProcessPayment(null);
  }

  // NOTE: Auto-advance logic removed to allow users to see and select payment methods
  // Users must explicitly click a "Pay" button to proceed to the PSP bridge

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
    clearSuccessTimeout();
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
            phone: data?.phone ?? phone,
            amount: displayAmount,
            currency: displayCurrency,
            ref: state.paymentIntent.id,
            accessCode: state.paymentIntent.clientSecret,
            channels: state.selectedMethod === 'mobile_money' ? ['mobile_money'] : ['card'],
            metadata: {
              ...metadata,
              org_id: state.paymentIntent.orgId ?? (metadata?.org_id as string),
              payment_id: state.paymentIntent.id,
              connection_id: state.paymentIntent.connectionId ?? (metadata?.connection_id as string),
              customer_phone: data?.phone ?? phone,
            },
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
            purchaseDescription: `Payment for ${displayAmount} ${displayCurrency}`,
            amount: displayAmount,
            apiBaseUrl,
            callbackUrl: `${apiBaseUrl || 'https://api.reevit.io'}/v1/webhooks/incoming/hubtel`,
            clientReference: state.paymentIntent.providerRefId || state.paymentIntent.reference || state.paymentIntent.id,
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
            amount: displayAmount,
            currency: displayCurrency,
            customer: {
              email: email ?? '',
              phone_number: data?.phone ?? phone ?? '',
            },
            meta: {
              ...metadata,
              org_id: state.paymentIntent.orgId ?? (metadata?.org_id as string),
              payment_id: state.paymentIntent.id,
              connection_id: state.paymentIntent.connectionId ?? (metadata?.connection_id as string),
              customer_phone: data?.phone ?? phone,
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
            amount: displayAmount,
            currency: displayCurrency,
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
            amount: displayAmount,
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

  async function handleProviderSelect(provider: string) {
    // Toggle behavior - clicking same PSP collapses it
    if (provider === selectedProvider) {
      selectedProvider = null;
      return;
    }

    const providerEntry = providerOptions.find((option) => option.provider === provider);
    const methods = providerEntry?.methods?.length ? providerEntry.methods : configuredMethods;
    const methodForInit =
      state.selectedMethod && methods.includes(state.selectedMethod) ? state.selectedMethod : methods[0];

    selectedProvider = provider as PSPType;

    // Select the appropriate method for this provider
    // No need to re-initialize - we already have the payment intent with available_psps
    // Re-initializing would create a duplicate payment
    if (methodForInit) {
      store.selectMethod(methodForInit);
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
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    clearSuccessTimeout();
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
      class="reevit-brut-overlay"
      role="button"
      tabindex="0"
      on:click={handleClose}
      on:keydown={(e: KeyboardEvent) => e.key === 'Escape' && handleClose()}
    >
      <div
        class={cn('reevit-brut__modal', store.isComplete() && 'reevit-brut__modal--success')}
        style={themeStyles}
        data-reevit-theme={dataTheme}
        role="dialog"
        aria-modal="true"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <div class="reevit-brut__topbar">
          <div class="reevit-brut__topbar-left">
            <span class="reevit-brut__dot"></span>
            <span>Reevit Checkout</span>
          </div>
          <button class="reevit-brut__close" on:click={handleClose} aria-label="Close">
            [ESC]
          </button>
        </div>

        <div class="reevit-brut__header">
          <div class="reevit-brut__brand-line">
            {#if resolvedTheme?.logoUrl}
              <img src={resolvedTheme.logoUrl} alt="" class="reevit-brut__brand-logo" />
            {:else if brandName}
              <span class="reevit-brut__brand-fallback">{brandName.charAt(0)}</span>
            {/if}
            <span>MERCHANT: {(brandName || 'CHECKOUT').toUpperCase()}</span>
          </div>
          <div class="reevit-brut__amount-row">
            <div class="reevit-brut__amount">
              <span class="reevit-brut__amount-bracket">[</span>
              {formatAmount(displayAmount, displayCurrency)}
              <span class="reevit-brut__amount-bracket">]</span>
            </div>
            <span class="reevit-brut__amount-tag">DUE NOW</span>
          </div>
        </div>

        {#if state.status === 'loading'}
          <LoadingState
            marker="PREPARING"
            title="Setting up checkout"
            message="This will only take a moment"
          />
        {:else if storeIsProcessing}
          <LoadingState marker="PROCESSING" title="Confirming your payment" />
        {:else if state.status === 'success' && state.result}
          <div class="reevit-brut__state">
            <span class="reevit-brut__state-marker">SUCCESS</span>
            <div class="reevit-brut__check-block">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </div>
            <h3 class="reevit-brut__state-title">PAYMENT CAPTURED</h3>
            <p class="reevit-brut__state-sub">
              {formatAmount(displayAmount, displayCurrency)}<br />
              REF: {state.result.reference}
            </p>
            <div
              class="reevit-brut__countdown"
              style={`animation-duration: ${successDelayMs}ms`}
            ></div>
          </div>
        {:else if state.status === 'failed' && state.error && !state.error.recoverable}
          <div class="reevit-brut__state">
            <span class="reevit-brut__state-marker">DECLINED</span>
            <div class="reevit-brut__error-block">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <h3 class="reevit-brut__state-title">PAYMENT FAILED</h3>
            <p class="reevit-brut__state-sub">{state.error.message}</p>
            <button class="reevit-brut__cta" style="max-width: 260px" on:click={() => store.initialize()}>
              <span>RETRY</span><span>&#8635;</span>
            </button>
          </div>
        {:else}
          <div class="reevit-brut__body">
            <div>
              <div class="reevit-brut__section-label">PROCESSOR</div>
              {#if providerOptions.length === 0}
                <div class="reevit-brut__methods-empty">&gt; NO PROCESSORS AVAILABLE</div>
              {:else}
                <div class="reevit-brut__providers">
                  {#each providerOptions as provider (provider.provider)}
                    <button
                      type="button"
                      class="reevit-brut__provider"
                      data-selected={activeProviderId === provider.provider}
                      disabled={storeIsLoading}
                      on:click={() => {
                        if (provider.provider !== selectedProvider) {
                          handleProviderSelect(provider.provider);
                        }
                      }}
                    >
                      {#if PROVIDER_LOGOS[provider.provider.toLowerCase()]}
                        <img
                          class="reevit-brut__provider-logo"
                          src={PROVIDER_LOGOS[provider.provider.toLowerCase()]}
                          alt=""
                        />
                      {:else}
                        <span class="reevit-brut__provider-fallback">
                          {provider.name.charAt(0).toUpperCase()}
                        </span>
                      {/if}
                      <span class="reevit-brut__provider-name">{provider.name}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <div>
              <div class="reevit-brut__section-label">SELECT_METHOD</div>
              {#if !selectedProvider || availableMethods.length === 0}
                <div class="reevit-brut__methods-empty">&gt; SELECT A PROCESSOR ABOVE</div>
              {:else}
                <div class="reevit-brut__methods">
                  {#each availableMethods as method, index (method)}
                    <button
                      type="button"
                      class={cn(
                        'reevit-brut__method',
                        availableMethods.length === 1 && 'reevit-brut__method--full'
                      )}
                      data-selected={state.selectedMethod === method}
                      disabled={storeIsLoading}
                      on:click={() => store.selectMethod(method)}
                    >
                      <span class="reevit-brut__method-id">
                        {String(index + 1).padStart(2, '0')} / {METHOD_CODE[method]}
                      </span>
                      <span class="reevit-brut__method-name">{METHOD_NAME[method]}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            {#if state.selectedMethod && needsMomoForm}
              <MobileMoneyForm
                initialPhone={phone}
                loading={storeIsLoading}
                hideCancel
                on:submit={(e) => handleProcessPayment(e.detail)}
                on:cancel={handleClose}
              />
            {:else}
              <button
                type="button"
                class="reevit-brut__cta"
                on:click={handleContinue}
                disabled={!selectedProvider || !state.selectedMethod || storeIsLoading}
              >
                <span>MAKE PAYMENT</span>
                <span>&rarr;</span>
              </button>
            {/if}
          </div>

          <div class="reevit-brut__footer">
            <span>Secured by Reevit</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
