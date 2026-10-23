<script lang="ts">
  /**
   * Collects the mobile money number. Two layouts:
   *  - `network` (Ghana): number + network picker. The network is auto-selected
   *    from the number's prefix as it is typed and can be overridden.
   *  - `mpesa` (Kenya): +254 prefix, M-Pesa mark, no network choice. The submitted
   *    phone is normalised to `254XXXXXXXXX`, which is what the M-Pesa flow sends.
   */
  import { createEventDispatcher, untrack } from 'svelte';
  import { cn } from '@reevit/core';
  import type { MobileMoneyNetwork, MobileMoneyFormData } from '@reevit/core';
  import { getMethodMarks } from '../ledger';
  import { validatePhone, detectNetwork } from '../phone';
  import Scope from './Scope.svelte';

  interface Props {
    initialPhone?: string;
    loading?: boolean;
    /** Hide the secondary Back button (the panel header already has one). */
    hideCancel?: boolean;
    mode?: 'network' | 'mpesa';
    /** Primary button label, e.g. "Pay GHS 755.00". */
    submitLabel?: string;
  }

  let { initialPhone = '', loading = false, hideCancel = false, mode = 'network', submitLabel = 'Continue' }: Props = $props();

  const dispatch = createEventDispatcher<{
    submit: MobileMoneyFormData;
    cancel: void;
  }>();

  type Network = Exclude<MobileMoneyNetwork, 'mpesa'>;
  const NETWORKS: { id: Network; name: string }[] = [
    { id: 'mtn', name: 'MTN' },
    { id: 'telecel', name: 'Telecel' },
    { id: 'airteltigo', name: 'AirtelTigo' },
  ];

  const digitsOf = (value: string) => value.replace(/\D/g, '');

  /** 0244128890 -> "024 412 8890". International input (+233…) is left as typed. */
  function formatLocal(value: string): string {
    if (value.startsWith('+')) return '+' + digitsOf(value).slice(0, 12);
    const d = digitsOf(value).slice(0, 10);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
  }

  /** National part of a Kenyan number: strips +254 / 254 / a leading 0, keeps 9 digits. */
  function nationalKenya(value: string): string {
    let d = digitsOf(value);
    if (d.startsWith('254')) d = d.slice(3);
    return d.replace(/^0/, '').slice(0, 9);
  }

  const formatKenya = (value: string) => (nationalKenya(value).match(/.{1,3}/g) || []).join(' ');

  // Layout and prefill are fixed when the form mounts.
  const mpesa = untrack(() => mode === 'mpesa');
  const startPhone = untrack(() => initialPhone);
  const uid = Math.random().toString(36).slice(2, 8);
  const inputId = `reevit-phone-${uid}`;
  const errorId = `${inputId}-error`;
  const networkErrorId = `${inputId}-network-error`;

  let phone = $state(mpesa ? formatKenya(startPhone) : formatLocal(startPhone));
  let network = $state<string | null>(mpesa ? 'mpesa' : startPhone ? detectNetwork(startPhone) : null);
  // Detection only overrides the choice when the number's operator changes, so a
  // manual pick survives further typing within the same operator.
  let lastDetected: string | null = !mpesa && startPhone ? detectNetwork(startPhone) : null;
  let error = $state<string | null>(null);
  let networkError = $state<string | null>(null);

  function handlePhoneInput(e: Event): void {
    const target = e.currentTarget as HTMLInputElement;
    error = null;
    if (mpesa) {
      phone = formatKenya(target.value);
      target.value = phone;
      return;
    }
    const next = formatLocal(target.value.replace(/[^0-9+]/g, ''));
    phone = next;
    target.value = next;
    const detected = detectNetwork(next.replace(/\s/g, ''));
    if (detected && detected !== lastDetected) {
      network = detected;
      networkError = null;
    }
    lastDetected = detected;
  }

  function handleSubmit(e: SubmitEvent): void {
    e.preventDefault();

    if (mpesa) {
      const national = nationalKenya(phone);
      if (national.length !== 9 || !/^[17]/.test(national)) {
        error = 'Enter a valid M-Pesa number';
        return;
      }
      dispatch('submit', { phone: `254${national}`, network: 'mpesa' as MobileMoneyNetwork });
      return;
    }

    const raw = phone.replace(/\s/g, '');
    if (!raw || !validatePhone(raw)) {
      error = 'Enter a 10-digit number, like 024 412 8890';
      return;
    }
    if (!network) {
      networkError = 'Choose your network';
      return;
    }
    if (!validatePhone(raw, network as MobileMoneyNetwork)) {
      error = 'This number doesn’t match the selected network';
      return;
    }
    dispatch('submit', { phone: raw, network: network as MobileMoneyNetwork });
  }

  const logos = mpesa ? [] : getMethodMarks('GH', 'mobile_money');
  const suffix = mpesa ? getMethodMarks('KE', 'mobile_money')[0] : undefined;
</script>

<Scope>
  <form class="reevit-form" data-reevit="momo-form" onsubmit={handleSubmit} novalidate>
    <div class="reevit-field">
      <label for={inputId}>{mpesa ? 'M-Pesa number' : 'Mobile money number'}</label>
      <div class={cn('reevit-input', mpesa && 'reevit-input--prefixed', !!error && 'reevit-input--invalid')}>
        {#if mpesa}<span class="reevit-prefix" aria-hidden="true">+254</span>{/if}
        <input
          id={inputId}
          type="tel"
          inputmode="tel"
          class="reevit-mono"
          autocomplete="tel-national"
          placeholder={mpesa ? '712 345 678' : '024 412 8890'}
          value={phone}
          oninput={handlePhoneInput}
          disabled={loading}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          data-first=""
        />
        {#if suffix}
          <span class="reevit-suffix" aria-hidden="true">
            <img src={suffix.src} data-mark={suffix.key} alt="" />
          </span>
        {/if}
      </div>
      {#if error}<p class="reevit-error" id={errorId} role="alert">{error}</p>{/if}
    </div>

    {#if !mpesa}
      <fieldset class="reevit-group">
        <legend>Network</legend>
        <div class="reevit-networks">
          {#each NETWORKS as n (n.id)}
            {@const logo = logos.find((mark) => mark.key === n.id)}
            <button
              type="button"
              class="reevit-network"
              aria-pressed={network === n.id}
              disabled={loading}
              onclick={() => {
                network = n.id;
                networkError = null;
              }}
            >
              {#if logo}<img src={logo.src} data-mark={logo.key} alt="" />{/if}
              {n.name}
            </button>
          {/each}
        </div>
        {#if networkError}<p class="reevit-error" id={networkErrorId} role="alert">{networkError}</p>{/if}
      </fieldset>
    {/if}

    <button type="submit" class="reevit-cta" data-reevit="cta" disabled={loading}>
      {loading ? 'Please wait' : submitLabel}
    </button>
    {#if !hideCancel}
      <button type="button" class="reevit-cta-secondary" onclick={() => dispatch('cancel')} disabled={loading}>
        Back
      </button>
    {/if}
  </form>
</Scope>
