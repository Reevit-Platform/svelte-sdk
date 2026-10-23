<script lang="ts">
  /** Account details could not be issued. */
  import type { BankFailure, DirectBank } from '../direct/directBank';
  import Scope from './Scope.svelte';

  interface Props {
    bank: DirectBank;
    failure: BankFailure;
    /** Offer "Choose another method" when the list has more than one method. */
    canChooseAnother: boolean;
    onChooseAnother: () => void;
    onClose: () => void;
  }
  let { bank, failure, canChooseAnother, onChooseAnother, onClose }: Props = $props();
</script>

<Scope>
  <div class="reevit-result reevit-result--prompt" data-reevit="failure" data-failure={failure.code}>
    <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
      <span class="reevit-fail-dot" aria-hidden="true"></span>{failure.title}
    </h2>
    <p class="reevit-text">{failure.message}</p>
    {#if failure.retryable}
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" disabled={bank.busy} onclick={() => void bank.start()}>
        Try again
      </button>
    {:else if !canChooseAnother}
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={onClose}>Close</button>
    {/if}
    {#if canChooseAnother}
      <div class="reevit-links">
        <button
          type="button"
          class="reevit-link"
          data-reevit="choose-another"
          data-first={failure.retryable ? undefined : ''}
          onclick={onChooseAnother}
        >
          Choose another method
        </button>
      </div>
    {/if}
  </div>
</Scope>
