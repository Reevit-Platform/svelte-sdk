<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatAmount, cn } from '@reevit/core';
  import type { PaymentMethod } from '@reevit/core';

  export let methods: PaymentMethod[];
  export let selected: PaymentMethod | null;
  export let amount: number;
  export let currency: string;

  const dispatch = createEventDispatcher<{
    select: PaymentMethod;
  }>();

  $: availableMethods = [
    {
      id: 'card' as const,
      name: 'Card',
      description: 'Visa, Mastercard, Maestro',
      icon: '💳',
    },
    {
      id: 'mobile_money' as const,
      name: 'Mobile Money',
      description: 'MTN, Vodafone, AirtelTigo',
      icon: '📱',
    },
    {
      id: 'bank_transfer' as const,
      name: 'Bank Transfer',
      description: 'Transfer directly from your bank',
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
