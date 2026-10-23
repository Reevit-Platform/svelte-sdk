<script lang="ts">
  interface Props {
    title: string;
    message: string;
    onRetry: () => void;
  }
  let { title, message, onRetry }: Props = $props();
</script>

<div class="reevit-result" data-reevit="failure">
  <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
    <span class="reevit-fail-dot" aria-hidden="true"></span>{title}
  </h2>
  <p class="reevit-text">{message}</p>
  <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={onRetry}>Try again</button>
</div>
