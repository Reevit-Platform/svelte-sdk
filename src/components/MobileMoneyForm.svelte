<script lang="ts">
  /**
   * MobileMoneyForm Component
   * Collects the mobile money phone number and network. The network is
   * auto-selected from the number's prefix as the user types, and can also
   * be picked manually.
   */
  import { createEventDispatcher } from 'svelte';
  import { validatePhone, detectNetwork, formatPhone, cn } from '@reevit/core';
  import type { MobileMoneyNetwork, MobileMoneyFormData } from '@reevit/core';

  export let initialPhone: string = '';
  export let loading: boolean = false;
  export let hideCancel: boolean = false;

  const dispatch = createEventDispatcher<{
    submit: MobileMoneyFormData;
    cancel: void;
  }>();

  let phone = initialPhone;
  let network: MobileMoneyNetwork | null = null;
  let error: string | null = null;
  let touched = false;

  const networks: { id: MobileMoneyNetwork; name: string }[] = [
    { id: 'mtn', name: 'MTN' },
    { id: 'telecel', name: 'Telecel' },
    { id: 'airteltigo', name: 'AirtelTigo' },
  ];

  // Auto-select the network that matches the number's prefix as it's typed.
  // The user can still override by tapping a network button.
  $: {
    const detected = detectNetwork(phone) as MobileMoneyNetwork | null;
    if (detected) {
      network = detected;
    }
  }

  $: {
    if (touched && phone) {
      if (!validatePhone(phone)) {
        error = 'Enter a valid mobile money number';
      } else if (network && !validatePhone(phone, network)) {
        error = "This number doesn't match the selected network";
      } else {
        error = null;
      }
    }
  }

  $: isValid = !!phone && !!network && validatePhone(phone, network);

  function handlePhoneInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    phone = target.value.replace(/[^0-9+]/g, '');
  }

  function handleSubmit(): void {
    touched = true;

    if (!phone || !validatePhone(phone)) {
      error = 'Enter a valid mobile money number';
      return;
    }

    if (!network) {
      error = 'Select your mobile money network';
      return;
    }

    if (!validatePhone(phone, network)) {
      error = "This number doesn't match the selected network";
      return;
    }

    dispatch('submit', { phone, network });
  }
</script>

<form class="reevit-brut__momo" on:submit|preventDefault={handleSubmit}>
  <div class="reevit-brut__field">
    <label for="reevit-phone" class="reevit-brut__field-label">
      Phone number
    </label>
    <input
      id="reevit-phone"
      type="tel"
      class={cn('reevit-brut__input', !!error && 'reevit-brut__input--error')}
      placeholder="024 XXX XXXX"
      value={phone}
      on:input={handlePhoneInput}
      on:blur={() => (touched = true)}
      disabled={loading}
      autocomplete="tel"
    />
    {#if phone && !error}
      <div class="reevit-brut__input-note">{formatPhone(phone)}</div>
    {/if}
    {#if error}
      <div class="reevit-brut__input-error">{error}</div>
    {/if}
  </div>

  <div class="reevit-brut__field">
    <span class="reevit-brut__field-label">Select network</span>
    <div class="reevit-brut__networks">
      {#each networks as n (n.id)}
        <button
          type="button"
          class="reevit-brut__network"
          data-selected={network === n.id}
          on:click={() => (network = n.id)}
          disabled={loading}
        >
          {n.name}
        </button>
      {/each}
    </div>
  </div>

  <div class="reevit-brut__momo-actions">
    {#if !hideCancel}
      <button
        type="button"
        class="reevit-brut__cta reevit-brut__cta--ghost"
        on:click={() => dispatch('cancel')}
        disabled={loading}
      >
        <span>BACK</span>
      </button>
    {/if}
    <button
      type="submit"
      class="reevit-brut__cta"
      disabled={!isValid || loading}
    >
      {#if loading}
        <span>PLEASE WAIT</span>
      {:else}
        <span>CONTINUE</span>
        <span>&rarr;</span>
      {/if}
    </button>
  </div>

  <p class="reevit-brut__momo-hint">
    You will receive a USSD prompt on your phone to authorize the payment.
  </p>
</form>
