<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cn } from '@reevit/core';
  import type { PaymentMethod } from '@reevit/core';
  import airteltigoLogo from '../assets/methods/airteltigo.png';
  import applePayLogo from '../assets/methods/apple-pay.png';
  import googlePayLogo from '../assets/methods/google-pay.png';
  import mastercardLogo from '../assets/methods/mastercard.png';
  import mpesaLogo from '../assets/methods/mpesa.png';
  import mtnLogo from '../assets/methods/mtn.png';
  import telecelLogo from '../assets/methods/telecel.png';
  import visaLogo from '../assets/methods/visa.png';

  export let methods: PaymentMethod[];
  export let selected: PaymentMethod | null;
  export let provider: string | undefined = undefined;
  export let layout: 'grid' | 'list' = 'list';
  export let showLabel: boolean = true;
  export let disabled: boolean = false;
  export let country: string | undefined = undefined;
  export let selectedTheme:
    | {
        backgroundColor?: string;
        textColor?: string;
        descriptionColor?: string;
        borderColor?: string;
      }
    | undefined = undefined;

  const dispatch = createEventDispatcher<{
    select: PaymentMethod;
  }>();

  $: isGrid = layout === 'grid';

  const methodConfig: Record<PaymentMethod, { name: string; icon: string }> = {
    card: {
      name: 'Card',
      icon: '💳',
    },
    mobile_money: {
      name: 'Mobile Money',
      icon: '📱',
    },
    bank_transfer: {
      name: 'Bank Transfer',
      icon: '🏦',
    },
    apple_pay: {
      name: 'Apple Pay',
      icon: '🍎',
    },
    google_pay: {
      name: 'Google Pay',
      icon: '🤖',
    },
  };

  const getMethodDescription = (method: PaymentMethod): string => {
    const c = (country || 'GH').toUpperCase();

    if (method === 'mobile_money') {
      const mobileMoneyDescriptions: Record<string, string> = {
        GH: 'MTN, Telecel, AirtelTigo Money',
        KE: 'M-Pesa, Airtel Money',
        NG: 'MTN MoMo, Airtel Money',
        ZA: 'Mobile Money',
      };
      return mobileMoneyDescriptions[c] || 'Mobile Money';
    }

    if (method === 'card') {
      return 'Pay with Visa, Mastercard, or other cards';
    }

    if (method === 'bank_transfer') {
      return 'Pay directly from your bank account';
    }

    if (method === 'apple_pay') {
      return 'Pay with Apple Pay';
    }

    if (method === 'google_pay') {
      return 'Pay with Google Pay';
    }

    return '';
  };

  const getMethodLogos = (method: PaymentMethod): string[] => {
    const c = (country || 'GH').toUpperCase();
    const logos = {
      visa: visaLogo,
      mastercard: mastercardLogo,
      apple_pay: applePayLogo,
      google_pay: googlePayLogo,
      mtn: mtnLogo,
      telecel: telecelLogo,
      airteltigo: airteltigoLogo,
      mpesa: mpesaLogo,
    };

    if (method === 'card') {
      return [logos.visa, logos.mastercard];
    }

    if (method === 'apple_pay') return [logos.apple_pay];
    if (method === 'google_pay') return [logos.google_pay];

    if (method === 'mobile_money') {
      if (c === 'GH') return [logos.mtn, logos.telecel, logos.airteltigo];
      if (c === 'KE') return [logos.mpesa];
      if (c === 'NG') return [logos.mtn];
      return [logos.mtn];
    }

    return [];
  };

  $: availableMethods = [
    {
      id: 'card' as const,
      name: methodConfig.card.name,
      icon: methodConfig.card.icon,
    },
    {
      id: 'mobile_money' as const,
      name: methodConfig.mobile_money.name,
      icon: methodConfig.mobile_money.icon,
    },
    {
      id: 'bank_transfer' as const,
      name: methodConfig.bank_transfer.name,
      icon: methodConfig.bank_transfer.icon,
    },
    {
      id: 'apple_pay' as const,
      name: methodConfig.apple_pay.name,
      icon: methodConfig.apple_pay.icon,
    },
    {
      id: 'google_pay' as const,
      name: methodConfig.google_pay.name,
      icon: methodConfig.google_pay.icon,
    },
  ]
    .filter((method) => methods.includes(method.id))
    .map((method) => ({
      ...method,
      description: getMethodDescription(method.id),
      logos: getMethodLogos(method.id),
    }));

  function handleSelect(id: PaymentMethod) {
    dispatch('select', id);
  }
</script>

<div class={cn('reevit-method-selector', isGrid && 'reevit-method-selector--grid')}>
  {#if showLabel}
    <div class="reevit-method-selector__label">Select payment method</div>
  {/if}
  <div
    class={cn('reevit-method-selector__options', isGrid ? 'reevit-method-selector__options--grid' : 'reevit-method-selector__options--list')}
    style:background-color={selectedTheme?.backgroundColor}
  >
    {#each availableMethods as method, index (method.id)}
      <button
        type="button"
        class={cn(
          'reevit-method-option',
          isGrid ? 'reevit-method-option--grid' : 'reevit-method-option--list',
          selected === method.id && 'reevit-method-option--selected',
          disabled && 'reevit-method-option--disabled'
        )}
        style:animation-delay={`${index * 0.05}s`}
        style:border-bottom-color={selectedTheme?.borderColor}
        disabled={disabled}
        aria-pressed={selected === method.id}
        on:click={() => handleSelect(method.id)}
      >
        <span class="reevit-method-option__icon-wrapper">
          {#if method.logos.length}
            <span class="reevit-method-option__logos">
              {#each method.logos.slice(0, 3) as logo (logo)}
                <img src={logo} alt="" class="reevit-method-option__logo-img" loading="lazy" />
              {/each}
            </span>
          {:else}
            <span class="reevit-method-option__icon">{method.icon}</span>
          {/if}
        </span>
        <div class="reevit-method-option__content">
          <span class="reevit-method-option__label" style:color={selectedTheme?.textColor}>{method.name}</span>
          {#if !isGrid}
            <span class="reevit-method-option__description" style:color={selectedTheme?.descriptionColor}>
              {method.description}
            </span>
          {/if}
        </div>
        {#if !isGrid}
          {#if selected === method.id}
            <span class="reevit-method-option__check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          {:else}
            <span class="reevit-method-option__chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
          {/if}
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* Local styles if needed, but we use styles.css */
</style>
