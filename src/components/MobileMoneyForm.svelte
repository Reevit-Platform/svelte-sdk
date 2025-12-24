<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { validatePhone, detectNetwork, cn } from '@reevit/core';
  import type { MobileMoneyNetwork, MobileMoneyFormData } from '@reevit/core';

  export let initialPhone: string = '';
  export let loading: boolean = false;

  const dispatch = createEventDispatcher<{
    submit: MobileMoneyFormData;
  }>();

  let phone = initialPhone;
  let network: MobileMoneyNetwork | null = null;
  let error: string | null = null;

  $: {
    const detected = detectNetwork(phone);
    if (detected) {
      network = detected;
    }
    if (error) {
      error = null;
    }
  }

  function handleSubmit() {
    if (!validatePhone(phone)) {
      error = 'Please enter a valid phone number';
      return;
    }

    if (!network) {
      error = 'Please select your mobile network';
      return;
    }

    dispatch('submit', {
      phone: phone,
      network: network,
    });
  }

  const providers = [
    { id: 'mtn' as const, name: 'MTN', color: '#FFCC00' },
    { id: 'vodafone' as const, name: 'Vodafone', color: '#E60000' },
    { id: 'airteltigo' as const, name: 'AirtelTigo', color: '#005596' },
  ];
</script>

<form class="reevit-momo-form" on:submit|preventDefault={handleSubmit}>
  <div class="reevit-form-group">
    <label class="reevit-label" for="reevit-phone">Phone Number</label>
    <input
      id="reevit-phone"
      bind:value={phone}
      type="tel"
      class={cn('reevit-input', error && !validatePhone(phone) && 'reevit-input--error')}
      placeholder="e.g. 024 123 4567"
      disabled={loading}
      autocomplete="tel"
    />
  </div>

  <div class="reevit-network-selector">
    <label class="reevit-label" for="reevit-network-grid">Select Network</label>
    <div id="reevit-network-grid" class="reevit-networks-grid">
      {#each providers as provider (provider.id)}
        <button
          type="button"
          class={cn('reevit-network-btn', network === provider.id && 'reevit-network-btn--selected')}
          on:click={() => (network = provider.id)}
          disabled={loading}
        >
          <div 
            class="reevit-network-dot" 
            style="background-color: {provider.color}" 
          ></div>
          {provider.name}
        </button>
      {/each}
    </div>
  </div>

  {#if error}
    <p class="reevit-error-message">{error}</p>
  {/if}

  <button 
    type="submit" 
    class="reevit-submit-btn" 
    disabled={loading || !phone}
  >
    {#if loading}
      <span class="reevit-spinner"></span>
    {:else}
      <span>Continue</span>
    {/if}
  </button>

  <p class="reevit-secure-text">
    🔒 Secure mobile money payment via Reevit
  </p>
</form>
