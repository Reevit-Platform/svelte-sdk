/**
 * @reevit/svelte
 * Unified Payment Widget for Svelte Applications
 */

// Components
export { default as ReevitCheckout } from './components/ReevitCheckout.svelte';
export { default as PaymentMethodSelector } from './components/PaymentMethodSelector.svelte';
export { default as MobileMoneyForm } from './components/MobileMoneyForm.svelte';

// Stores
export { createReevitStore, type ReevitStore } from './stores';

// Re-export core types and utilities
export type {
  PaymentMethod,
  MobileMoneyNetwork,
  ReevitCheckoutConfig,
  ReevitCheckoutCallbacks,
  CheckoutState,
  PaymentResult,
  PaymentError,
  ReevitTheme,
  MobileMoneyFormData,
  PaymentIntent,
  PSPType,
  ReevitState,
  ReevitAction,
} from '@reevit/core';

export {
  formatAmount,
  validatePhone,
  detectNetwork,
  formatPhone,
  detectCountryFromCurrency,
  cn,
  ReevitAPIClient,
  createReevitClient,
  createInitialState,
  reevitReducer,
} from '@reevit/core';

// PSP Script loaders
export {
  // Script loaders
  loadPaystackScript,
  loadHubtelScript,
  loadFlutterwaveScript,
  loadStripeScript,
  loadMonnifyScript,

  // Popup/Modal openers
  openPaystackPopup,
  openHubtelPopup,
  openFlutterwaveModal,
  createStripeInstance,
  confirmStripePayment,
  openMonnifyModal,
  initiateMPesaSTKPush,

  // Types
  type PaystackConfig,
  type HubtelConfig,
  type FlutterwaveConfig,
  type StripeConfig,
  type MonnifyConfig,
  type MPesaConfig,
  type MPesaSTKPushResult,
} from './bridges';

