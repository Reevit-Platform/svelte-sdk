<script lang="ts">
  /** Back chevron + title row used by every detail panel. */
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** Omit when the panel is the only step (nothing to go back to). */
    onBack?: () => void;
  }
  let { title, onBack }: Props = $props();
</script>

<div class={onBack ? 'reevit-panel-head' : 'reevit-panel-head reevit-panel-head--plain'}>
  {#if onBack}
    <button type="button" class="reevit-back" data-reevit="back" aria-label="Back to payment methods" onclick={onBack}>
      <Icon name="back" />
    </button>
  {/if}
  <h2 class={onBack ? 'reevit-panel-title' : 'reevit-panel-title reevit-sr'} tabindex="-1" data-reevit="panel-title">
    {title}
  </h2>
</div>
