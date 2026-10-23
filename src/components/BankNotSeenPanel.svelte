<script lang="ts">
  /** The provider has not seen the transfer yet: check again, or keep waiting. */
  import type { DirectBank } from '../direct/directBank';
  import Scope from './Scope.svelte';

  let { bank }: { bank: DirectBank } = $props();
</script>

<Scope>
  <div data-reevit="bank-not-seen">
    <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
      <span class="reevit-fail-dot" aria-hidden="true"></span>We haven’t seen it yet
    </h2>
    <p class="reevit-text">Transfers can take a few minutes to arrive.</p>
    {#if bank.notice}<p class="reevit-status" data-reevit="status" role="status" aria-live="polite">{bank.notice}</p>{/if}
    <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={() => void bank.sent()}>
      Check again
    </button>
    <button type="button" class="reevit-cta-secondary" data-reevit="keep-waiting" onclick={bank.keepWaiting}>
      Keep waiting
    </button>
  </div>
</Scope>
