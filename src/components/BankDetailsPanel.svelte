<script lang="ts">
  /**
   * The account to pay into, then "I've sent it"; once the clock runs out, "Get new
   * details". It renders the state of the direct bank store; it decides nothing itself.
   */
  import { onDestroy } from 'svelte';
  import type { BankDetails } from '../direct/api';
  import type { DirectBank } from '../direct/directBank';
  import { countdown, formatAccountNumber, mmss, plainAmount } from '../direct/format';
  import BankCopyButton from './BankCopyButton.svelte';
  import PanelHead from './PanelHead.svelte';
  import Scope from './Scope.svelte';

  interface Props {
    bank: DirectBank;
    details: BankDetails;
    currency: string;
    amountText: string;
    onBack?: () => void;
    now?: () => number;
  }
  let { bank, details, currency, amountText, onBack, now = Date.now }: Props = $props();

  // The countdown ticks four times a second while there is a deadline.
  let tick = $state(0);
  const timer = setInterval(() => (tick += 1), 250);
  onDestroy(() => clearInterval(timer));

  const seconds = $derived.by(() => {
    void tick;
    return countdown(bank.expiresAt, bank.startedAt, now()).seconds;
  });
  let announcement = $state('');
  const expired = $derived(bank.phase === 'expired');
  // Some providers (Flutterwave in Ghana) return no account name: the row is simply absent.
  const rows = $derived([
    { label: 'Bank', text: details.bank, raw: undefined as string | undefined, mono: false },
    { label: 'Account number', text: formatAccountNumber(details.account_number), raw: details.account_number.replace(/\s/g, ''), mono: true },
    ...(details.account_name ? [{ label: 'Account name', text: details.account_name, raw: undefined, mono: false }] : []),
    { label: 'Amount', text: amountText, raw: plainAmount(details.amount, currency), mono: true },
  ]);
</script>

<Scope>
  <PanelHead title="Bank transfer" {onBack} />
  <div data-reevit="bank" data-state={expired ? 'expired' : 'live'} data-payment-id={bank.attempt?.id}>
    <ul class="reevit-bank" data-reevit="bank-details">
      {#each rows as row (row.label)}
        <li>
          <div class="reevit-bank-cell">
            <small>{row.label}</small>
            <span class={row.mono ? 'reevit-bank-value reevit-mono' : 'reevit-bank-value'}>{row.text}</span>
          </div>
          {#if row.raw !== undefined}
            <BankCopyButton label={row.label} value={row.raw} onCopied={(message) => (announcement = message)} />
          {/if}
        </li>
      {/each}
    </ul>
    {#if expired}
      <p class="reevit-expiry">
        <span data-reevit="status" role="status" aria-live="polite">{bank.notice ?? 'These details have expired.'}</span>
      </p>
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" disabled={bank.busy} onclick={() => void bank.newDetails()}>
        Get new details
      </button>
    {:else}
      <p class="reevit-expiry">
        <span>Expires in</span>
        <span class="reevit-mono" data-reevit="countdown" role="timer" aria-label="Time left">{mmss(seconds)}</span>
      </p>
      {#if bank.notice}<p class="reevit-status" data-reevit="status" role="status" aria-live="polite">{bank.notice}</p>{/if}
      <button type="button" class="reevit-cta" data-reevit="cta" data-first="" onclick={() => void bank.sent()}>
        I’ve sent it
      </button>
    {/if}
    <span class="reevit-sr" role="status" aria-live="polite">{announcement}</span>
  </div>
</Scope>
