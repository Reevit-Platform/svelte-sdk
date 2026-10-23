<script lang="ts">
  /**
   * Waiting for the shopper to approve the prompt on their phone. It renders the
   * state of the direct charge; it decides nothing itself.
   */
  import { onDestroy } from 'svelte';
  import { FAILOVER_NOW, type DirectCharge } from '../direct/directCharge';
  import { NETWORK_LABEL, countdown, mmss } from '../direct/format';
  import Scope from './Scope.svelte';

  interface Props {
    charge: DirectCharge;
    /** The number as the shopper typed it; falls back to the server's masked form. */
    phoneText: string;
    network?: string;
    now?: () => number;
  }
  let { charge, phoneText, network, now = Date.now }: Props = $props();

  // The countdown ticks four times a second while there is a deadline.
  let tick = $state(0);
  const timer = setInterval(() => (tick += 1), 250);
  onDestroy(() => clearInterval(timer));

  const clock = $derived.by(() => {
    void tick;
    return { at: now(), ...countdown(charge.expiresAt, charge.startedAt, now()) };
  });
  const resendWait = $derived(charge.canResendAt ? Math.max(0, Math.ceil((charge.canResendAt - clock.at) / 1000)) : 0);
  const resendReady = $derived(!charge.resendClosed && !charge.resending && resendWait === 0);
  const status = $derived(charge.notice ?? (charge.attempt?.rerouted ? FAILOVER_NOW : ''));
  const label = $derived((network && NETWORK_LABEL[network]) || 'mobile money');
</script>

<Scope>
  <div class="reevit-wait" data-reevit="momo-wait" data-payment-id={charge.attempt?.id}>
    <span class="reevit-spin reevit-spin--lg" aria-hidden="true"></span>
    <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">Approve on your phone</h2>
    <!-- The network is its own text node, as in the React markup: Chrome places glyphs per text run, so the split keeps the two pixel-identical. -->
    <p class="reevit-text">
      Check <span class="reevit-mono">{phoneText}</span> for a {#key label}{label}{/key} prompt.
    </p>
    <div class="reevit-countdown">
      <span class="reevit-mono" data-reevit="countdown" role="timer" aria-label="Time left">{mmss(clock.seconds)}</span>
      <div class="reevit-bar" aria-hidden="true"><i style="transform: scaleX({clock.fraction})"></i></div>
    </div>
    <p class="reevit-status" data-reevit="status" role="status" aria-live="polite">{status}</p>
    <button
      type="button"
      class="reevit-cta"
      data-reevit="cta"
      data-first=""
      disabled={charge.checking}
      onclick={() => void charge.check()}
    >
      I’ve approved
    </button>
    <div class="reevit-links">
      {#if !charge.resendClosed}
        <button
          type="button"
          class="reevit-link"
          data-reevit="resend"
          disabled={!resendReady}
          aria-disabled={!resendReady}
          onclick={() => void charge.resend()}
        >
          {resendWait > 0 ? `Resend prompt in ${resendWait}s` : 'Resend prompt'}
        </button>
      {/if}
      <button type="button" class="reevit-link" data-reevit="change-number" onclick={charge.useAnotherNumber}>
        Use another number
      </button>
    </div>
  </div>
</Scope>
