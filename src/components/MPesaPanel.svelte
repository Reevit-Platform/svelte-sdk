<script lang="ts">
  /**
   * M-Pesa STK push: sends the prompt, then shows the "approve on your phone"
   * and failure panels. The push itself is server-side; success arrives through
   * the payment's confirmation, not from here.
   */
  import { onMount } from 'svelte';
  import { initiateMPesaSTKPush } from '../bridges';
  import LoadingState from './LoadingState.svelte';
  import Scope from './Scope.svelte';

  interface Props {
    /** API endpoint that sends the STK push. */
    apiEndpoint: string;
    /** Customer phone number in format 254XXXXXXXXX */
    phoneNumber: string;
    amount: number;
    currency?: string;
    reference: string;
    /** Extra request headers, e.g. `x-reevit-public-key`. */
    headers?: Record<string, string>;
    description?: string;
    onSuccess: (result: { transactionId: string; [key: string]: unknown }) => void;
    onError: (error: { code: string; message: string }) => void;
    /** Shows a "Use another number" action while waiting or after a failure. */
    onChangeNumber?: () => void;
  }

  let { apiEndpoint, phoneNumber, amount, currency, headers, reference, description, onSuccess, onError, onChangeNumber }: Props = $props();

  type State = 'initiating' | 'waiting' | 'failed';
  let status = $state<State>('initiating');
  let error = $state<string | null>(null);
  let checkoutRequestId = $state<string | null>(null);
  let destroyed = false;

  /** 254722334455 -> "+254 722 334 455". Anything else is shown as given. */
  function formatKenyaPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) {
      return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    }
    return phone;
  }

  async function start(): Promise<void> {
    status = 'initiating';
    error = null;
    let failure: string | null = null;
    const result = await initiateMPesaSTKPush(
      {
        phoneNumber,
        amount,
        currency,
        headers,
        reference,
        description: description || `Payment ${reference}`,
        onInitiated: () => {},
        onSuccess: (res) => onSuccess(res),
        onError: (err) => {
          failure = err.message;
        },
      },
      apiEndpoint,
    );
    if (destroyed) return;
    if (result.status === 'initiated') {
      checkoutRequestId = result.transactionId ?? null;
      status = 'waiting';
      return;
    }
    const message = failure || result.message || 'Failed to initiate M-Pesa payment';
    error = message;
    status = 'failed';
    onError({ code: 'MPESA_ERROR', message });
  }

  // The checkout has already collected the number on its own screen, so the push
  // starts straight away instead of asking for a second tap.
  onMount(() => {
    void start();
    return () => {
      destroyed = true;
    };
  });

  const shownPhone = $derived(formatKenyaPhone(phoneNumber));
</script>

{#if status === 'initiating'}
  <LoadingState variant="line" title="Sending a prompt to your phone…" />
{:else if status === 'waiting'}
  <Scope>
    <div class="reevit-wait" data-reevit="mpesa-waiting" data-request-id={checkoutRequestId ?? undefined}>
      <span class="reevit-spin reevit-spin--lg" aria-hidden="true"></span>
      <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">Approve on your phone</h2>
      <p class="reevit-text">
        Check <span class="reevit-mono">{shownPhone}</span> for an M-Pesa prompt.
      </p>
      <p class="reevit-status" data-reevit="status" role="status" aria-live="polite">Waiting for your approval…</p>
      {#if onChangeNumber}
        <div class="reevit-links">
          <button type="button" class="reevit-link" data-reevit="change-number" onclick={onChangeNumber}>Use another number</button>
        </div>
      {/if}
    </div>
  </Scope>
{:else}
  <Scope>
    <div class="reevit-result" data-reevit="failure">
      <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
        <span class="reevit-fail-dot" aria-hidden="true"></span>Payment request failed
      </h2>
      <p class="reevit-text">{error || 'Something went wrong. Please try again.'}</p>
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={() => void start()}>Try again</button>
      {#if onChangeNumber}
        <button type="button" class="reevit-cta-secondary" onclick={onChangeNumber}>Use another number</button>
      {/if}
    </div>
  </Scope>
{/if}
