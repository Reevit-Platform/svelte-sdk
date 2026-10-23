<script lang="ts">
  /**
   * M-Pesa STK push. Creating the payment is what sends the push: the server
   * pushes the prompt to the number the payment was created with. This panel only
   * waits. It polls the public confirm-intent route and ends on `succeeded` or a
   * final failure, never on `pending`.
   *
   * Phase 0 stopgap: replaced by the Phase 1 status endpoint.
   */
  import { onMount } from 'svelte';
  import { ReevitAPIClient } from '@reevit/core';
  import { pollPaymentStatus } from '../utils/pollPaymentStatus';
  import Scope from './Scope.svelte';

  /** Poll every 4 s, and give up after 2 min (the prompt expires on the handset around then). */
  const POLL_INTERVAL_MS = 4000;
  const POLL_TIMEOUT_MS = 120_000;

  interface Props {
    /** The payment the STK push was sent for. */
    paymentId: string;
    /** The payment's client secret, for the public confirm-intent route. */
    clientSecret?: string;
    /** Public key, used only when there is no client secret. */
    publicKey?: string;
    /** API base URL (defaults to production). */
    apiBaseUrl?: string;
    /** Customer phone number in format 254XXXXXXXXX */
    phoneNumber: string;
    /** Merchant order reference, passed back with the result. */
    reference?: string;
    onSuccess: (result: { transactionId: string; reference: string; pspReference: string }) => void;
    onError: (error: { code: string; message: string; recoverable: boolean }) => void;
    /** Starts a new prompt to the same number. Shown as "Try again" on the failure panel. */
    onRetry?: () => void;
    /** Shows a "Use another number" action while waiting or after a failure. */
    onChangeNumber?: () => void;
  }

  let { paymentId, clientSecret, publicKey, apiBaseUrl, phoneNumber, reference, onSuccess, onError, onRetry, onChangeNumber }: Props = $props();

  type FailureKind = 'declined' | 'timeout';

  const FAILURE_COPY: Record<FailureKind, { title: string; message: string; code: string }> = {
    declined: {
      title: 'Payment not approved',
      message: 'The M-Pesa request was declined or cancelled.',
      code: 'PAYMENT_DECLINED',
    },
    timeout: {
      title: 'No response in time',
      message: 'We didn’t get an approval from your phone.',
      code: 'PAYMENT_TIMEOUT',
    },
  };

  let failure = $state<FailureKind | null>(null);

  /** 254722334455 -> "+254 722 334 455". Anything else is shown as given. */
  function formatKenyaPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) {
      return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    }
    return phone;
  }

  onMount(() => {
    const controller = new AbortController();
    const client = new ReevitAPIClient({ publicKey, baseUrl: apiBaseUrl });

    void pollPaymentStatus({
      check: () => (clientSecret ? client.confirmPaymentIntent(paymentId, clientSecret) : client.confirmPayment(paymentId)),
      signal: controller.signal,
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: POLL_TIMEOUT_MS,
    }).then((outcome) => {
      if (outcome.kind === 'aborted') return;
      if (outcome.kind === 'succeeded') {
        const pspReference = (outcome.data.provider_ref_id as string | undefined) || paymentId;
        onSuccess({ transactionId: pspReference, reference: reference || '', pspReference });
        return;
      }
      const kind: FailureKind = outcome.kind === 'timeout' ? 'timeout' : 'declined';
      failure = kind;
      onError({ code: FAILURE_COPY[kind].code, message: FAILURE_COPY[kind].message, recoverable: true });
    });

    return () => controller.abort();
  });

  const shownPhone = $derived(formatKenyaPhone(phoneNumber));
  const copy = $derived(failure ? FAILURE_COPY[failure] : null);
</script>

{#if copy}
  <Scope>
    <div class="reevit-result" data-reevit="failure" data-failure={failure}>
      <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
        <span class="reevit-fail-dot" aria-hidden="true"></span>{copy.title}
      </h2>
      <p class="reevit-text">{copy.message}</p>
      {#if onRetry}
        <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={onRetry}>Try again</button>
      {/if}
      {#if onChangeNumber}
        <button type="button" class="reevit-cta-secondary" onclick={onChangeNumber}>Use another number</button>
      {/if}
    </div>
  </Scope>
{:else}
  <Scope>
    <div class="reevit-wait" data-reevit="mpesa-waiting" data-payment-id={paymentId}>
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
{/if}
