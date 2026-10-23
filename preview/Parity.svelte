<script lang="ts">
  import { onMount } from 'svelte';
  import { ReevitCheckout } from '../src';
  import logoBlack from './img/logo-short-black.png';
  import logoWhite from './img/logo-short-white.png';
  import { amount, currency, intent, params, provider, state as shot, theme } from './stubs';

  const needsClick = params.get('pointer') === '1';
  let open = $state(!needsClick);

  const theming = {
    companyName: 'Kente & Co.',
    logoUrl: theme === 'dark' ? logoWhite : logoBlack,
    darkMode: theme === 'dark',
  };

  // Drive the widget into the requested state.
  let driven = false;
  $effect(() => {
    if (!open || driven) return;
    driven = true;
    const qs = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const click = (sel: string) => qs(sel)?.click();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await wait(60);
      if (['opening', 'stripe', 'processing', 'failure', 'receipt', 'confirm'].includes(shot)) {
        click('[data-reevit="row"][data-method="card"]');
      }
      if (shot === 'confirm') {
        await wait(150);
        click('[data-reevit="close"]');
      }
      if (shot === 'mpesa-waiting' || shot === 'mpesa-failed') {
        await wait(60);
        click('[data-reevit="momo-form"] [data-reevit="cta"]');
      }
      document.documentElement.dataset.ready = shot;
    })();
  });
</script>

<div class="stage">
  <div class="frame" id="frame">
    <div class="mx">
      <div class="mx-nav"><img src={logoBlack} alt="" /><b>Kente &amp; Co.</b><span>Cart · 3</span></div>
      <main class="mx-main">
        <div class="mx-ph" role="img" aria-label="Product photo"></div>
        <div>
          <h1>Your basket</h1>
          <p class="mx-p">{currency} 755.00</p>
          <div class="mx-li"><span>Adinkra throw, hand-loomed</span><i>{currency} 480.00</i></div>
          <div class="mx-li"><span>Kente table runner × 2</span><i>{currency} 250.00</i></div>
          <div class="mx-li"><span>Delivery</span><i>{currency} 25.00</i></div>
          {#if !open}
            <button class="mx-pay" type="button" onclick={() => (open = true)}>Pay {currency} 755.00</button>
          {/if}
        </div>
      </main>
    </div>
    <ReevitCheckout
      bind:isOpen={open}
      publicKey="pfk_test_preview"
      {amount}
      {currency}
      reference="ORD-24817"
      email="ama.owusu@example.com"
      phone={provider === 'mpesa' ? '0712345678' : '0244128890'}
      paymentMethods={['card', 'mobile_money', 'bank_transfer']}
      initialPaymentIntent={shot === 'loading' ? undefined : intent}
      successDelayMs={600000}
      theme={theming}
    />
  </div>
</div>
