<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatAmount, cn } from '@reevit/core';
  import type { PaymentMethod } from '@reevit/core';

  export let methods: PaymentMethod[];
  export let selected: PaymentMethod | null;
  export let amount: number;
  export let currency: string;
  export let provider: string | undefined = undefined;

  const dispatch = createEventDispatcher<{
    select: PaymentMethod;
  }>();

  // Human-readable PSP names
  const pspNames: Record<string, string> = {
    hubtel: 'Hubtel',
    paystack: 'Paystack',
    flutterwave: 'Flutterwave',
    monnify: 'Monnify',
    mpesa: 'M-Pesa',
    stripe: 'Stripe',
  };

  function getMethodName(method: PaymentMethod): string {
    // For Hubtel, show "Pay with Hubtel" for mobile_money
    if (provider?.toLowerCase().includes('hubtel') && method === 'mobile_money') {
      return `Pay with ${pspNames[provider.toLowerCase()] || 'Hubtel'}`;
    }

    const names: Record<PaymentMethod, string> = {
      card: 'Card',
      mobile_money: 'Mobile Money',
      bank_transfer: 'Bank Transfer',
    };
    return names[method];
  }

  function getMethodDescription(method: PaymentMethod): string {
    // Hubtel handles everything internally
    if (provider?.toLowerCase().includes('hubtel')) {
      return 'Card, Mobile Money, and Bank Transfer';
    }

    const descriptions: Record<PaymentMethod, string> = {
      card: 'Visa, Mastercard, Maestro',
      mobile_money: 'MTN, Vodafone, AirtelTigo',
      bank_transfer: 'Transfer directly from your bank',
    };
    return descriptions[method];
  }

  $: availableMethods = [
    {
      id: 'card' as const,
      name: getMethodName('card'),
      description: getMethodDescription('card'),
      icon: '💳',
    },
    {
      id: 'mobile_money' as const,
      name: getMethodName('mobile_money'),
      description: getMethodDescription('mobile_money'),
      icon: '📱',
    },
    {
      id: 'bank_transfer' as const,
      name: getMethodName('bank_transfer'),
      description: getMethodDescription('bank_transfer'),
      icon: '🏦',
    },
  ].filter(m => methods.includes(m.id));

  function handleSelect(id: PaymentMethod) {
    dispatch('select', id);
  }
</script>

<div class="reevit-method-selector">
  <h3 class="reevit-section-title">Select Payment Method</h3>
  <p class="reevit-amount-display">
    Pay {formatAmount(amount, currency)}
  </p>

  <div class="reevit-methods-grid">
    {#each availableMethods as method (method.id)}
      <button
        type="button"
        class={cn('reevit-method-card', selected === method.id && 'reevit-method-card--selected')}
        on:click={() => handleSelect(method.id)}
      >
        <span class="reevit-method-icon">{method.icon}</span>
        <div class="reevit-method-info">
          <span class="reevit-method-name">{method.name}</span>
          <span class="reevit-method-description">{method.description}</span>
        </div>
        <div class="reevit-method-radio">
          {#if selected === method.id}
            <div class="reevit-radio-inner"></div>
          {/if}
        </div>
      </button>
    {/each}
  </div>
</div>

<style>
  /* Local styles if needed, but we use styles.css */
</style>
