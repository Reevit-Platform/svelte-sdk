<script lang="ts">
  /**
   * LoadingState Component
   * The single brutalist loading screen used for every loading state across
   * the checkout — server connection, PSP connection, payment processing.
   */

  /** Small status tag above the bars (e.g. "CONNECTING", "PROCESSING"). */
  export let marker: string = 'PROCESSING';
  /** Headline. */
  export let title: string = 'Please wait';
  /** Sub-line beneath the headline. */
  export let message: string = 'Do not close this window';
</script>

<div class="reevit-brut__state">
  <span class="reevit-brut__state-marker">{marker}</span>
  <div class="reevit-brut__bars">
    <span></span><span></span><span></span><span></span><span></span>
  </div>
  <h3 class="reevit-brut__state-title">{title}</h3>
  <p class="reevit-brut__state-sub">{message}</p>
</div>
