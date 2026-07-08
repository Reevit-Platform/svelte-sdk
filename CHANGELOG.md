# Changelog

All notable changes to `@reevit/svelte` will be documented in this file.

## [0.10.1] - 2026-07-08

### 🐛 Bug Fixes

- **Paystack card/mobile-money payments never confirmed.** The Paystack popup
  loaded Inline **v1** and called `PaystackPop.setup()` without the payment
  intent's access code, so it created a **new, unrelated Paystack
  transaction** instead of resuming the one the Reevit backend initialized.
  The customer's charge succeeded at Paystack, but Reevit kept verifying its
  own untouched reference — the payment stayed `pending` forever. The loader
  now uses the Inline v2 instance API: `resumeTransaction(accessCode,
  callbacks)` when the intent carries an access code (the normal Reevit
  flow), and `newTransaction({...})` with camelCase keys otherwise.
  `ReevitCheckout` passes the access code, customer phone, and a payment
  channel hint through to the popup. Popup errors are now surfaced through a
  new optional `onError` callback on `PaystackConfig` instead of being
  ignored.
- Fixed CI dependency resolution: `@reevit/core` now resolves from the npm
  registry instead of a local `../core` link that only exists in the monorepo
  layout.

## [Unreleased] - 2026-02-04

### 🛠 Improvements

- Added `idempotencyKey` support in checkout config and intent initialization.
- Added in-flight dedupe for payment intent creation.

## [0.5.0] - 2026-01-11

### 🚀 New Features

#### Apple Pay & Google Pay Support
- Added `apple_pay` and `google_pay` as supported payment methods.
- Included localized logos for Apple Pay and Google Pay.

#### Local Asset Bundling
- Switched from CDN-hosted logos to local bundled assets for better performance and reliability.

#### Success Screen Customization
- Added `successDelayMs` prop to `ReevitCheckout` to control how long the success screen is displayed before closing (default: 5000ms).

### 📦 Install / Upgrade

```bash
npm install @reevit/svelte@0.5.0
```

---

## [0.3.2] - 2025-12-29

### 🐛 Bug Fixes

#### Fixed: Payment Method Selector Bypass
Resolved an issue where the `ReevitCheckout` component would bypass the payment method selection screen and auto-select 'card' when an `initialPaymentIntent` was provided. This fix ensures:
- The `ReevitCheckout` popup now correctly displays the payment method selector (e.g., Card, Mobile Money) when multiple options are available.
- The auto-advance logic is less aggressive, allowing users to make their selection within the popup.
- The store no longer auto-selects a method if more than one is available in the `initialPaymentIntent`.

### 🚀 New Features

#### Added: Controlled Mode Support
The `ReevitCheckout` component now supports controlled mode for advanced use cases like Payment Links:

```svelte
<script>
  let isCheckoutOpen = false;
  let paymentIntent = null; // Pre-fetched from backend
</script>

<ReevitCheckout
  {isOpen: isCheckoutOpen}
  onOpenChange={(open) => isCheckoutOpen = open}
  {initialPaymentIntent}
  // ... other props
/>
```

**New props:**
| Prop | Type | Description |
|------|------|-------------|
| `initialPaymentIntent` | `PaymentIntent` | Pass a pre-created payment intent (skips internal initialization) |

#### Added: Public Payment Confirmation
The SDK now supports confirming payments via a public endpoint using a client secret, enabling anonymous payment link flows without authentication.

### 📦 Install / Upgrade

```bash
npm install @reevit/svelte@0.3.2
# or
yarn add @reevit/svelte@0.3.2
# or
pnpm add @reevit/svelte@0.3.2
```

### ⚠️ Breaking Changes

None. This is a backwards-compatible release.

### Full Changelog

- `b5eca56` - fix: Restore payment method selector in ReevitCheckout
- `38ae223` - chore: Bump version to 0.3.2

## [0.1.0] - 2024-12-24

### Added
- Initial release
- **Components:**
  - `ReevitCheckout` - Complete checkout widget with modal UI
  - `PaymentMethodSelector` - Payment method selection component
  - `MobileMoneyForm` - Mobile money input with network detection
- **Stores:**
  - `createReevitStore` - Svelte store factory for state management
- **PSP Bridge Functions:**
  - `openPaystackPopup()` - Paystack inline popup
  - `openFlutterwaveModal()` - Flutterwave checkout
  - `openHubtelPopup()` - Hubtel checkout
  - `createStripeInstance()` - Stripe.js initialization
  - `confirmStripePayment()` - Stripe payment confirmation
  - `openMonnifyModal()` - Monnify SDK modal
  - `initiateMPesaSTKPush()` - M-Pesa STK Push
- **Script Loaders:**
  - `loadPaystackScript()`
  - `loadFlutterwaveScript()`
  - `loadHubtelScript()`
  - `loadStripeScript()`
  - `loadMonnifyScript()`
- Theme customization support
- Dark mode support
- Svelte 5 runes compatible
- TypeScript support
- Accessibility (a11y) compliant modal
