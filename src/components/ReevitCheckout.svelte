<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { createReevitStore } from '../stores/reevit';
  import { createThemeVariables, cn } from '@reevit/core';
  import type { ReevitTheme } from '@reevit/core';
  import PaymentMethodSelector from './PaymentMethodSelector.svelte';
  import MobileMoneyForm from './MobileMoneyForm.svelte';
  import { openPaystackPopup, openHubtelPopup, openFlutterwaveModal } from '../bridges';

  const dispatch = createEventDispatcher<{
    success: any;
    error: any;
    close: void;
  }>();

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
    },
    onSuccess: (result) => dispatch('success', result),
    onError: (err) => dispatch('error', err),
    onClose: () => {
      isOpen = false;
      dispatch('close');
    },
  });

  $: state = $store;
  $: themeVars = createThemeVariables(theme);

  $: if (isOpen) {
    document.body.style.overflow = 'hidden';
    if (!state.paymentIntent) {
      store.initialize();
    }
  } else {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  function handleOpen() {
    isOpen = true;
  }

  function handleClose() {
    isOpen = false;
    store.close();
  }

  async function handleProcessPayment(data: any) {
    if (!state.paymentIntent) return;

    const psp = state.paymentIntent.recommendedPsp;

    try {
      if (psp === 'paystack') {
        await openPaystackPopup({
          key: publicKey,
          email: email || '',
          amount: amount,
          currency: currency,
          ref: state.paymentIntent.id,
          onSuccess: (res) => store.handlePspSuccess(res),
          onClose: () => {},
        });
      } else if (psp === 'hubtel') {
        await openHubtelPopup({
          clientId: publicKey,
          purchaseDescription: `Payment for ${amount} ${currency}`,
          amount: amount,
          customerPhone: data?.phone || phone,
          customerEmail: email,
          onSuccess: (res) => store.handlePspSuccess(res),
          onClose: () => {},
        });
      } else if (psp === 'flutterwave') {
        await openFlutterwaveModal({
          public_key: publicKey,
          tx_ref: state.paymentIntent.id,
          amount: amount,
          currency: currency,
          customer: {
            email: email || '',
            phone_number: data?.phone || phone,
          },
          callback: (res) => store.handlePspSuccess(res),
          onclose: () => {},
        });
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

<div class="reevit-sdk-container" style={Object.entries(themeVars).map(([k,v]) => `${k}:${v}`).join(';')}>
  <slot {handleOpen} isLoading={state.status === 'loading'}>
    <button 
      type="button" 
      class="reevit-pay-button" 
      on:click={handleOpen}
      disabled={state.status === 'loading'}
    >
      {#if state.status === 'loading'}
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
      on:click|self={handleClose}
      on:keydown={(e) => e.key === 'Escape' && handleClose()}
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
          {:else if state.status === 'ready' || state.status === 'method_selected'}
            <PaymentMethodSelector
              methods={paymentMethods}
              selected={state.selectedMethod}
              amount={amount}
              currency={currency}
              on:select={(e) => store.selectMethod(e.detail)}
            />

            {#if state.status === 'method_selected' && state.selectedMethod === 'mobile_money'}
              <div class="reevit-method-form-container">
                <MobileMoneyForm 
                  initialPhone={phone}
                  loading={state.status === 'processing'}
                  on:submit={(e) => handleProcessPayment(e.detail)}
                />
              </div>
            {/if}

            {#if state.status === 'method_selected' && state.selectedMethod === 'card'}
              <div class="reevit-card-info">
                <p class="reevit-info-text">You will be redirected to our secure payment partner to complete your card payment.</p>
                <button 
                  class="reevit-submit-btn" 
                  on:click={() => handleProcessPayment(null)}
                  disabled={state.status === 'processing'}
                >
                  {#if state.status === 'processing'}
                    <span class="reevit-spinner"></span>
                  {:else}
                    <span>Proceed to Card Payment</span>
                  {/if}
                </button>
              </div>
            {/if}
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
