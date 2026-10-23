<script lang="ts">
  /** Declined, insufficient funds, no response, provider trouble, locked, out of attempts. */
  import type { DirectCharge, DirectFailure } from '../direct/directCharge';
  import Scope from './Scope.svelte';

  interface Props {
    charge: DirectCharge;
    failure: DirectFailure;
    /** Offer "Choose another method" when the list has more than one method. */
    canChooseAnother: boolean;
    onChooseAnother: () => void;
    onClose: () => void;
  }
  let { charge, failure, canChooseAnother, onChooseAnother, onClose }: Props = $props();

  const resendable = $derived(failure.kind === 'timeout' && !charge.resendClosed);
  const exhausted = $derived(failure.kind === 'exhausted' || !failure.retryable);
  const primary = $derived(
    exhausted
      ? null
      : resendable
        ? { label: 'Send a new prompt', run: () => void charge.resend(), busy: charge.resending }
        : { label: 'Try again', run: () => void charge.retry(), busy: false },
  );
</script>

<Scope>
  <div class="reevit-result reevit-result--prompt" data-reevit="failure" data-failure={failure.kind}>
    <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
      <span class="reevit-fail-dot" aria-hidden="true"></span>{failure.title}
    </h2>
    <p class="reevit-text">{failure.message}</p>
    {#if charge.notice}<p class="reevit-status" data-reevit="status" role="status" aria-live="polite">{charge.notice}</p>{/if}
    {#if primary}
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" disabled={primary.busy} onclick={primary.run}>
        {primary.label}
      </button>
    {/if}
    {#if !exhausted}
      <button type="button" class="reevit-cta-secondary" data-reevit="change-number" onclick={charge.useAnotherNumber}>
        Use another number
      </button>
    {/if}
    {#if exhausted && !canChooseAnother}
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={onClose}>Close</button>
    {/if}
    {#if canChooseAnother}
      <div class="reevit-links">
        <button type="button" class="reevit-link" data-reevit="choose-another" data-first={exhausted ? '' : undefined} onclick={onChooseAnother}>
          Choose another method
        </button>
      </div>
    {/if}
  </div>
</Scope>
