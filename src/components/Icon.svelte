<script lang="ts">
  /** Inline icons for the Ledger checkout. Stroke styling comes from `.reevit-root svg`. */
  let { name }: { name: 'close' | 'back' | 'chevron' } = $props();
</script>

{#if name === 'close'}
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
{:else if name === 'back'}
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
{:else}
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>
{/if}
