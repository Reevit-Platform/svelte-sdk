<script lang="ts">
  /**
   * The Ledger dialog frame: scrim, header, amount line, scrolling body, footer,
   * leave-confirmation, and the accessibility plumbing (focus in, Tab trap, Esc,
   * focus return to the opener, polite live region).
   */
  import { onDestroy, setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { FooterProvider } from '../ledger';
  import Icon from './Icon.svelte';
  import { SCOPE_KEY } from './scope';

  interface Props {
    theme?: 'light' | 'dark';
    style?: string;
    brandName: string;
    logoUrl?: string;
    /** True when brandName is a real company name (drives the initial fallback). */
    hasBrandName: boolean;
    amountText: string;
    orderRef?: string;
    footerProvider?: FooterProvider | null;
    /** Changes whenever a new view mounts; moves focus into it. */
    viewKey: string;
    /** Text announced to screen readers when the view changes. */
    announce: string;
    confirmOpen: boolean;
    onRequestClose: () => void;
    onStay: () => void;
    onLeave: () => void;
    children: Snippet;
  }

  let {
    theme,
    style,
    brandName,
    logoUrl,
    hasBrandName,
    amountText,
    orderRef,
    footerProvider,
    viewKey,
    announce,
    confirmOpen,
    onRequestClose,
    onStay,
    onLeave,
    children,
  }: Props = $props();

  setContext(SCOPE_KEY, true);

  const FOCUSABLE = 'button,input,a[href],[tabindex]:not([tabindex="-1"])';
  const uid = Math.random().toString(36).slice(2, 8);
  const titleId = `reevit-title-${uid}`;
  const confirmTitleId = `reevit-confirm-title-${uid}`;

  // DOM handles; they never drive rendering, so they are deliberately not reactive.
  let rootEl: HTMLDivElement | undefined;
  let dialogEl: HTMLDivElement | undefined;
  let bodyEl: HTMLDivElement | undefined;
  // svelte-ignore non_reactive_update
  let confirmEl: HTMLDivElement | undefined;
  // svelte-ignore non_reactive_update
  let stayEl: HTMLButtonElement | undefined;
  let lastFocus: Element | null = null;
  let live = $state('');

  // Return focus to whatever opened the checkout.
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  onDestroy(() => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
  });

  // Move focus into each new view and announce it.
  $effect(() => {
    void viewKey;
    const body = bodyEl;
    if (!body) return;
    const target = body.querySelector<HTMLElement>('[data-first]') ?? body.querySelector<HTMLElement>('[data-reevit="panel-title"]');
    target?.focus({ preventScroll: true });
    live = '';
    const frame = requestAnimationFrame(() => {
      live = announce;
    });
    return () => cancelAnimationFrame(frame);
  });

  // Leave confirmation takes focus, and gives it back when dismissed.
  let confirmSeen = false;
  $effect(() => {
    if (confirmOpen) {
      confirmSeen = true;
      lastFocus = document.activeElement;
      stayEl?.focus({ preventScroll: true });
      live = 'Leave checkout? Your payment hasn’t finished.';
      return;
    }
    if (!confirmSeen) return;
    confirmSeen = false;
    const prev = lastFocus;
    lastFocus = null;
    if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true });
  });

  function onKeyDown(e: KeyboardEvent): void {
    const root = rootEl;
    if (!root) return;
    const active = document.activeElement;
    // Leave keys alone while focus is in a provider window or elsewhere on the page.
    if (active && active !== document.body && !root.contains(active)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (confirmOpen) onStay();
      else onRequestClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const scope = confirmOpen ? confirmEl : dialogEl;
    if (!scope) return;
    const items = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => !(n as HTMLButtonElement).disabled && !n.closest('[inert],[hidden]'),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!active || !scope.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });
</script>

<div bind:this={rootEl} class="reevit-root" {style} data-reevit="root" data-reevit-theme={theme}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="reevit-scrim"
    data-reevit="scrim"
    onclick={(e) => {
      if (e.target === e.currentTarget) onRequestClose();
    }}
  >
    <div bind:this={dialogEl} class="reevit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <i class="reevit-grabber" aria-hidden="true"></i>
      <header class="reevit-header" data-reevit="header" inert={confirmOpen || undefined}>
        <div class="reevit-brand">
          {#if logoUrl}
            <img class="reevit-brand-logo" src={logoUrl} alt="" />
          {:else if hasBrandName}
            <span class="reevit-brand-initial" aria-hidden="true">{brandName.charAt(0).toUpperCase()}</span>
          {/if}
          <h1 class="reevit-title" id={titleId} data-reevit="title">{brandName}</h1>
        </div>
        <button type="button" class="reevit-close" data-reevit="close" aria-label="Close checkout" onclick={onRequestClose}>
          <Icon name="close" />
        </button>
      </header>
      <div class="reevit-summary" inert={confirmOpen || undefined}>
        <span class="reevit-amount reevit-mono" data-reevit="amount">{amountText}</span>
        {#if orderRef}<span class="reevit-ref" data-reevit="ref">{orderRef}</span>{/if}
      </div>
      <div class="reevit-body" bind:this={bodyEl} data-reevit="body" inert={confirmOpen || undefined}>{@render children()}</div>
      <footer class="reevit-footer" data-reevit="footer" inert={confirmOpen || undefined}>
        <span>Secured by Reevit</span>
        {#if footerProvider}
          <span class="reevit-footer-sep" aria-hidden="true"></span>
          <img
            class="reevit-footer-logo"
            data-reevit="footer-logo"
            data-kind={footerProvider.kind}
            data-provider={footerProvider.id}
            src={footerProvider.src}
            alt={footerProvider.name}
          />
        {/if}
      </footer>
      {#if confirmOpen}
        <div bind:this={confirmEl} class="reevit-confirm" data-reevit="confirm" role="alertdialog" aria-modal="true" aria-labelledby={confirmTitleId}>
          <div class="reevit-confirm-box">
            <h2 id={confirmTitleId} tabindex="-1">Leave checkout?</h2>
            <p>Your payment hasn’t finished.</p>
            <button bind:this={stayEl} type="button" class="reevit-cta" data-reevit="stay" onclick={onStay}>Keep paying</button>
            <button type="button" class="reevit-cta-secondary" data-reevit="leave" onclick={onLeave}>Leave</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
  <div class="reevit-sr" role="status" aria-live="polite" data-reevit="live">{live}</div>
</div>
