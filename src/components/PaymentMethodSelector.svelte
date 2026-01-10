<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { cn } from '@reevit/core';
  import type { PaymentMethod } from '@reevit/core';

  export let methods: PaymentMethod[];
  export let selected: PaymentMethod | null;
  export let provider: string | undefined = undefined;
  export let layout: 'grid' | 'list' = 'list';
  export let showLabel: boolean = true;

  const dispatch = createEventDispatcher<{
    select: PaymentMethod;
  }>();

  $: isGrid = layout === 'grid';

  $: availableMethods = [
    {
      id: 'card' as const,
      name: 'Card',
      icon: '💳',
      description: 'Pay with Visa, Mastercard, or other cards',
    },
    {
      id: 'mobile_money' as const,
      name: 'Mobile Money',
      icon: '📱',
      description: 'MTN, Vodafone Cash, AirtelTigo Money',
    },
    {
      id: 'bank_transfer' as const,
      name: 'Bank Transfer',
      icon: '🏦',
      description: 'Pay directly from your bank account',
    },
  ].filter(m => methods.includes(m.id));

  function handleSelect(id: PaymentMethod) {
    dispatch('select', id);
  }
</script>

<div class={cn('reevit-method-selector', isGrid && 'reevit-method-selector--grid')}>
  {#if showLabel}
    <div class="reevit-method-selector__label">Select payment method</div>
  {/if}
  <div class={cn('reevit-method-selector__options', isGrid ? 'reevit-method-selector__options--grid' : 'reevit-method-selector__options--list')}>
    {#each availableMethods as method, index (method.id)}
      <button
        type="button"
        class={cn(
          'reevit-method-option',
          isGrid ? 'reevit-method-option--grid' : 'reevit-method-option--list',
          selected === method.id && 'reevit-method-option--selected'
        )}
        style="animation-delay: {index * 0.05}s"
        on:click={() => handleSelect(method.id)}
      >
        <span class="reevit-method-option__icon-wrapper">
          <span class="reevit-method-option__icon">{method.icon}</span>
        </span>
        <div class="reevit-method-option__content">
          <span class="reevit-method-option__label">{method.name}</span>
          {#if !isGrid}
            <span class="reevit-method-option__description">{method.description}</span>
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
