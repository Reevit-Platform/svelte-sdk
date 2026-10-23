<script lang="ts">
  /**
   * The Ledger "working" look. `block` is the centred processing state
   * (spinner, title, optional line); `line` is the compact spinner line shown
   * under a panel header while a provider window is opening.
   */
  import Scope from './Scope.svelte';

  interface Props {
    title?: string;
    message?: string;
    variant?: 'block' | 'line';
  }
  let { title = 'Please wait', message, variant = 'block' }: Props = $props();
</script>

<Scope>
  {#if variant === 'line'}
    <p class="reevit-opening" data-reevit="status" role="status">
      <span class="reevit-spin" aria-hidden="true"></span>{title}
    </p>
  {:else}
    <div class="reevit-processing" data-reevit="processing">
      <span class="reevit-spin reevit-spin--lg" aria-hidden="true"></span>
      <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">{title}</h2>
      {#if message}<p class="reevit-text">{message}</p>{/if}
    </div>
  {/if}
</Scope>
