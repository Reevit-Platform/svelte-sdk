/**
 * @reevit/svelte
 * Unified Payment Widget for Svelte Applications
 */

import './styles.css';

// Components
export { default as ReevitCheckout } from './components/ReevitCheckout.svelte';
export { default as ProviderSelector } from './components/ProviderSelector.svelte';
export { default as PaymentMethodSelector } from './components/PaymentMethodSelector.svelte';
export { default as MobileMoneyForm } from './components/MobileMoneyForm.svelte';

// Stores
export { createReevitStore, type ReevitStore } from './stores';

// Direct mobile money and bank transfer (Reevit's own screens)
export { createDirectCharge } from './direct/directCharge';
export type {
  DirectCharge,
  DirectChargeStore,
  DirectChargeOptions,
  DirectChargeState,
  DirectFailure,
  DirectPhase,
  DirectInput,
} from './direct/directCharge';
export { createDirectBank } from './direct/directBank';
export type {
  DirectBank,
  DirectBankStore,
  DirectBankOptions,
  DirectBankState,
  BankPhase,
  BankFailure,
} from './direct/directBank';
export { createDirectChargeClient } from './direct/api';
export type { DirectChargeApi, PublicAttempt, BankDetails, DirectApiError } from './direct/api';
export type { MethodOption, CheckoutProvider } from './types';

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
  PaymentSource,
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

  // Types
  type PaystackConfig,
  type HubtelConfig,
  type FlutterwaveConfig,
  type StripeConfig,
  type MonnifyConfig,
} from './bridges';
