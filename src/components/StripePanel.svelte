<script lang="ts">
  /**
   * Stripe's Payment Element inside the Ledger dialog, styled through Stripe's
   * `appearance` API. Card details never touch Reevit's code: they live in
   * Stripe's own iframe.
   */
  import { onMount } from 'svelte';
  import { createStripeInstance } from '../bridges';
  import type { StripeElements, StripeCardElement, StripeInstance } from '../bridges/loaders';
  import { formatMoney } from '../ledger';
  import { getReevitStripeAppearance } from '../stripeAppearance';
  import LoadingState from './LoadingState.svelte';
  import Scope from './Scope.svelte';

  interface Props {
    publishableKey: string;
    clientSecret: string;
    amount: number;
    currency: string;
    /** Use the dark Ledger palette for Stripe Elements. */
    dark?: boolean;
    onSuccess: (result: { paymentIntentId: string; status: string }) => void;
    onError: (error: { code: string; message: string }) => void;
  }

  let { publishableKey, clientSecret, amount, currency, dark = false, onSuccess, onError }: Props = $props();

  let isLoading = $state(true);
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  let container: HTMLDivElement | undefined;

  let stripe: StripeInstance | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripeCardElement | null = null;

  onMount(() => {
    let mounted = true;

    (async () => {
      try {
        stripe = await createStripeInstance(publishableKey);
        if (!mounted) return;

        elements = stripe.elements({ clientSecret, appearance: getReevitStripeAppearance(dark) });
        paymentElement = elements.create('payment');
        if (container) paymentElement.mount(container);

        paymentElement.on('ready', () => {
          if (mounted) isLoading = false;
        });
        paymentElement.on('change', (event: { error?: { message: string } }) => {
          error = event.error ? event.error.message : null;
        });
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to initialize Stripe';
          error = message;
          isLoading = false;
          onError({ code: 'STRIPE_INIT_ERROR', message });
        }
      }
    })();

    return () => {
      mounted = false;
      paymentElement?.destroy();
    };
  });

  async function handleSubmit(): Promise<void> {
    if (!stripe || !elements) {
      onError({ code: 'NOT_INITIALIZED', message: 'Stripe not initialized' });
      return;
    }

    isSubmitting = true;
    error = null;

    try {
      // Validate the form first
      const submitted = await elements.submit?.();
      if (submitted?.error) {
        error = submitted.error.message;
        onError({ code: submitted.error.code || 'VALIDATION_ERROR', message: submitted.error.message });
        return;
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (confirmError) {
        error = confirmError.message;
        onError({ code: confirmError.code || 'PAYMENT_ERROR', message: confirmError.message });
      } else if (paymentIntent) {
        onSuccess({ paymentIntentId: paymentIntent.id, status: paymentIntent.status });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      error = message;
      onError({ code: 'UNKNOWN_ERROR', message });
    } finally {
      isSubmitting = false;
    }
  }

  const formattedAmount = $derived(formatMoney(amount, currency));
</script>

<Scope {dark}>
  <div class="reevit-stripe-bridge" data-reevit="stripe">
    {#if isLoading}
      <LoadingState variant="line" title="Opening Stripe…" />
    {/if}

    <div bind:this={container} class="reevit-stripe-element" style:display={isLoading ? 'none' : 'block'}></div>

    {#if error && !isLoading}
      <p class="reevit-error" role="alert">{error}</p>
    {/if}

    {#if !isLoading}
      <button type="button" class="reevit-cta" data-reevit="cta" onclick={handleSubmit} disabled={isLoading || isSubmitting}>
        {#if isSubmitting}
          <span class="reevit-spin" aria-hidden="true"></span>
          <span>Processing…</span>
        {:else}
          Pay {formattedAmount}
        {/if}
      </button>
    {/if}
  </div>
</Scope>
