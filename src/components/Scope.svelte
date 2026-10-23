<script lang="ts">
  /**
   * Every Ledger style is scoped under `.reevit-root`. Inside ReevitCheckout that
   * root already exists; panels rendered on their own get a static one so they
   * look the same without a dialog around them.
   */
  import { getContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import { SCOPE_KEY } from './scope';

  let { children, dark = false }: { children: Snippet; dark?: boolean } = $props();
  const inside = getContext<boolean>(SCOPE_KEY) === true;
</script>

{#if inside}
  {@render children()}
{:else}
  <div class="reevit-root reevit-root--inline" data-reevit-theme={dark ? 'dark' : undefined}>
    {@render children()}
  </div>
{/if}
