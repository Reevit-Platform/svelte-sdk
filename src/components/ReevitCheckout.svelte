<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createReevitStore } from '../stores/reevit';
  import { createThemeVariables, cn } from '@reevit/core';
  import type { ReevitTheme, PaymentIntent, PaymentResult, PaymentMethod } from '@reevit/core';
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

  export let publicKey: string;
  export let amount: number;
  export let currency: string;
  export let email: string | undefined = undefined;
  export let phone: string | undefined = undefined;
  export let reference: string | undefined = undefined;
  export let metadata: Record<string, unknown> | undefined = undefined;
  export let paymentMethods: ('card' | 'mobile_money' | 'bank_transfer')[] = ['card', 'mobile_money'];
  export let theme: ReevitTheme = {};
  export let isOpen: boolean = false;
  export let apiBaseUrl: string | undefined = undefined;
  export let initialPaymentIntent: PaymentIntent | undefined = undefined;

  interface StoreConfig {
    publicKey: string;
    amount: number;
    currency: string;
    email: string | undefined;
    phone: string | undefined;
    reference: string | undefined;
    metadata: Record<string, unknown> | undefined;
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
      reference,
      metadata,
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
  $: themeVars = createThemeVariables(theme);
  $: psp = state.paymentIntent?.recommendedPsp ?? 'paystack';

  // Reactive booleans for template - using store getters to avoid type narrowing
  $: storeIsLoading = store.isLoading();
  $: storeIsProcessing = store.getStatus() === 'processing';
  $: storeIsMethodSelected = store.getStatus() === 'method_selected';

  // Watch for intent and selected method to auto-advance
  $: if (isOpen && state.paymentIntent && state.selectedMethod) {
    // For card, auto-advance immediately if we have an intent
    if (state.selectedMethod === 'card') {
      handleProcessPayment(null);
    }
    // For MoMo, we need a phone number (either from prop or form)
    // The form handles its own submission, so we don't auto-advance MoMo here
    // unless we already have the data we need.
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
  }

  function handleClose(): void {
    isOpen = false;
    store.close();
  }

  async function handleProcessPayment(data: { phone?: string } | null): Promise<void> {
    if (!state.paymentIntent) return;

    const currentPsp = state.paymentIntent.recommendedPsp;

    try {
      switch (currentPsp) {
        case 'paystack': {
          await openPaystackPopup({
            key: publicKey,
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
          await openHubtelPopup({
            clientId: (typeof merchantAccount === 'string' ? merchantAccount : publicKey),
            purchaseDescription: `Payment for ${amount} ${currency}`,
            amount,
            customerPhone: data?.phone ?? phone ?? '',
            customerEmail: email ?? '',
            hubtelSessionToken: state.paymentIntent.id,
            onSuccess: (res) => store.handlePspSuccess(res),
            onClose: () => {},
          });
          break;
        }
        case 'flutterwave': {
          await openFlutterwaveModal({
            public_key: publicKey,
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
          await openMonnifyModal({
            apiKey: state.paymentIntent.pspPublicKey ?? publicKey,
            contractCode: (typeof contractCode === 'string' ? contractCode : publicKey),
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
      <div class={cn('reevit-modal-content', theme.darkMode && 'reevit-modal--dark')}>
        <button class="reevit-modal-close" on:click={handleClose} aria-label="Close">
          &times;
        </button>

        <div class="reevit-modal-header">
          <img
            src="https://i.imgur.com/bzUR5Lm.png"
            alt="Reevit"
            class="reevit-modal__logo"
          />
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
            <PaymentMethodSelector
              methods={paymentMethods}
              selected={state.selectedMethod}
              amount={amount}
              currency={currency}
              provider={psp}
              on:select={(e) => store.selectMethod(e.detail as PaymentMethod)}
            />
          {/if}

          {#if storeIsMethodSelected && state.selectedMethod === 'mobile_money'}
            <div class="reevit-method-form-container">
              <MobileMoneyForm
                initialPhone={phone}
                loading={storeIsProcessing}
                on:submit={(e) => handleProcessPayment(e.detail)}
              />
            </div>
          {/if}

          {#if storeIsMethodSelected && state.selectedMethod === 'card'}
            <div class="reevit-card-info">
              <p class="reevit-info-text">You will be redirected to our secure payment partner to complete your card payment.</p>
              <button
                class="reevit-submit-btn"
                on:click={() => handleProcessPayment(null)}
                disabled={storeIsProcessing}
              >
                {#if storeIsProcessing}
                  <span class="reevit-spinner"></span>
                {:else}
                  <span>Proceed to Card Payment</span>
                {/if}
              </button>
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
