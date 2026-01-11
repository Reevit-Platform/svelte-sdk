<script lang="ts">
  import type { CheckoutProviderOption, PaymentMethod, ReevitTheme } from '@reevit/core';
  import { cn } from '@reevit/core';
  import { createEventDispatcher } from 'svelte';
  import PaymentMethodSelector from './PaymentMethodSelector.svelte';
  import flutterwaveLogo from '../assets/providers/flutterwave.png';
  import hubtelLogo from '../assets/providers/hubtel.png';
  import monnifyLogo from '../assets/providers/monnify.png';
  import mpesaLogo from '../assets/providers/mpesa.png';
  import paystackLogo from '../assets/providers/paystack.png';
  import stripeLogo from '../assets/providers/stripe.png';

  export let providers: CheckoutProviderOption[] = [];
  export let selectedProvider: string | null = null;
  export let disabled: boolean = false;
  export let theme: ReevitTheme | undefined = undefined;
  export let selectedMethod: PaymentMethod | null = null;
  export let country: string | undefined = undefined;

  type SelectedTheme = {
    backgroundColor?: string;
    textColor?: string;
    descriptionColor?: string;
    borderColor?: string;
  };

  let selectedTheme: SelectedTheme | undefined;
  let accordionBorderTop: string | undefined;

  const dispatch = createEventDispatcher<{
    select: string;
    methodSelect: PaymentMethod;
  }>();

  const providerLogos: Record<string, string> = {
    paystack: paystackLogo,
    stripe: stripeLogo,
    flutterwave: flutterwaveLogo,
    hubtel: hubtelLogo,
    monnify: monnifyLogo,
    mpesa: mpesaLogo,
  };

  const methodLabels: Record<PaymentMethod, string> = {
    card: 'Card',
    mobile_money: 'Mobile Money',
    bank_transfer: 'Bank Transfer',
    apple_pay: 'Apple Pay',
    google_pay: 'Google Pay',
  };

  const formatMethods = (methods: PaymentMethod[]): string => {
    if (!methods.length) return 'Payment methods';
    return methods.map((method) => methodLabels[method]).join(', ');
  };

  const sanitizeMethods = (providerId: string, methods: PaymentMethod[]): PaymentMethod[] => {
    if (providerId.toLowerCase().includes('hubtel')) {
      return methods.filter((method) => method === 'card' || method === 'mobile_money');
    }
    return methods;
  };

  function handleSelect(provider: string) {
    dispatch('select', provider);
  }

  $: selectedTheme = theme
    ? {
        backgroundColor: theme.selectedBackgroundColor,
        textColor: theme.selectedTextColor,
        descriptionColor: theme.selectedDescriptionColor,
        borderColor: theme.selectedBorderColor,
      }
    : undefined;

  $: accordionBorderTop = theme?.selectedBorderColor
    ? `1px solid ${theme.selectedBorderColor}`
    : undefined;

  const resolveCountry = (provider: CheckoutProviderOption): string => {
    return provider.countries?.[0] || country || 'GH';
  };
</script>

<div class="reevit-psp-selector">
  <div class="reevit-psp-selector__label">Select payment provider</div>
  <div class="reevit-psp-selector__options">
    {#each providers as provider (provider.provider)}
      {@const isSelected = selectedProvider === provider.provider}
      {@const providerMethods = sanitizeMethods(provider.provider, provider.methods)}
      <div class="reevit-psp-accordion">
        <button
          type="button"
          class={cn(
            'reevit-psp-option',
            isSelected && 'reevit-psp-option--selected',
            disabled && 'reevit-psp-option--disabled'
          )}
          on:click={() => handleSelect(provider.provider)}
          disabled={disabled}
          aria-expanded={isSelected}
        >
          <span class="reevit-psp-option__logo" aria-hidden="true">
            {#if providerLogos[provider.provider]}
              <img
                src={providerLogos[provider.provider]}
                alt=""
                class="reevit-psp-option__logo-img"
                loading="lazy"
              />
            {:else}
              <span class="reevit-psp-option__logo-fallback">
                {provider.name.slice(0, 1).toUpperCase()}
              </span>
            {/if}
          </span>
          <div class="reevit-psp-option__content">
            <span class="reevit-psp-option__name">Pay with {provider.name}</span>
            <span class="reevit-psp-option__methods">{formatMethods(providerMethods)}</span>
          </div>
        </button>

        {#if isSelected}
          <div
            class="reevit-psp-accordion__content reevit-animate-fade-in"
            style:border-top={accordionBorderTop}
          >
            <div class="reevit-psp-methods">
              <PaymentMethodSelector
                methods={providerMethods}
                selected={selectedMethod}
                provider={provider.provider}
                layout="list"
                showLabel={false}
                disabled={disabled}
                country={resolveCountry(provider)}
                selectedTheme={selectedTheme}
                on:select={(e) => dispatch('methodSelect', e.detail)}
              />
            </div>
            <slot name="method-content" />
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
