<script lang="ts">
  /** One field for the OTP or voucher the provider asked for. */
  import type { DirectCharge } from '../direct/directCharge';
  import Scope from './Scope.svelte';

  interface Props {
    charge: DirectCharge;
  }
  let { charge }: Props = $props();

  const id = `reevit-code-${Math.random().toString(36).slice(2, 8)}`;
  let code = $state('');

  const voucher = $derived(charge.codeKind === 'voucher');
  const action = $derived(charge.attempt?.next_action);
  const masked = $derived(action?.phone_masked);
  const ussd = $derived(action?.voucher?.ussd);
  const busy = $derived(charge.phase === 'submitting');
  const ready = $derived(code.replace(/\D/g, '').length >= 4);

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    if (!ready || busy) return;
    void charge.submitCode(code.replace(/\s/g, ''));
  }

  function onInput(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    code = target.value.replace(/[^\d]/g, '').slice(0, 8);
    target.value = code;
  }
</script>

<Scope>
  <div data-reevit="momo-code" data-kind={voucher ? 'voucher' : 'otp'}>
    <h2 class="reevit-panel-title" tabindex="-1" data-reevit="panel-title">
      {voucher ? 'Enter your voucher' : 'Enter your code'}
    </h2>
    <p class="reevit-text">
      {#if voucher}
        {#if ussd}Dial <span class="reevit-mono">{ussd}</span> for your voucher.{:else}{action?.voucher?.hint ?? 'Get a voucher from your phone’s menu.'}{/if}
      {:else}
        Sent to <span class="reevit-mono">{masked ?? 'your phone'}</span>.
      {/if}
    </p>
    <form class="reevit-form reevit-code-form" onsubmit={submit} novalidate>
      <div class="reevit-field">
        <div class={charge.codeError ? 'reevit-input reevit-input--invalid' : 'reevit-input'}>
          <input
            {id}
            aria-label={voucher ? 'Voucher code' : 'Code'}
            class="reevit-mono"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={8}
            placeholder="••••••"
            value={code}
            disabled={busy}
            aria-invalid={charge.codeError ? 'true' : undefined}
            aria-describedby={charge.codeError ? `${id}-error` : undefined}
            data-first=""
            oninput={onInput}
          />
        </div>
        {#if charge.codeError}<p class="reevit-error" id="{id}-error" role="alert">{charge.codeError}</p>{/if}
      </div>
      <button type="submit" class="reevit-cta" data-reevit="cta" disabled={!ready || busy}>
        {busy ? 'Please wait' : 'Continue'}
      </button>
      <div class="reevit-links">
        <button type="button" class="reevit-link" data-reevit="change-number" onclick={charge.useAnotherNumber}>
          Use another number
        </button>
      </div>
    </form>
  </div>
</Scope>
