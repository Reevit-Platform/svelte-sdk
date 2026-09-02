# Changelog

All notable changes to `@reevit/svelte` will be documented in this file.

## [Unreleased]

### Added

- `sessionSecret` and `idempotencyKey` props on `ReevitCheckout`. A
  server-created checkout session now drives the widget end to end, and
  `amount`/`currency` are optional when one is supplied.
- A vitest suite with a smoke test covering the server-session flow, wired
  into CI.

### Changed

- Requires `@reevit/core` `^0.9.1`, which sends a per-attempt UUID as the
  `Idempotency-Key` instead of a 32-bit hash and honours the currency
  exponent when formatting amounts (a 5,000 XOF charge no longer renders as
  `50.00`).
- Every PSP bridge call and the country fallback read the amount and currency
  from the payment intent when there is one, falling back to the props.
- **Release order:** `@reevit/core` 0.9.1 must be published to npm before
  `@reevit/svelte` can install via `npm ci`, build in CI, or be published.
  `package-lock.json` still resolves core 0.9.0 and predates the new test
  dependencies; regenerate it once 0.9.1 is on npm.

### Fixed

- A checkout configured with neither `sessionSecret`, `amount`+`currency`,
  `paymentLinkCode` nor `initialPaymentIntent` now dispatches `error` on mount
  instead of failing later inside the API client.

## [0.10.2] - 2026-07-18

### Changed

- Publishing moved to npm trusted publishing and the provenance repository
  field was corrected. No source changes.

## [0.10.1] - 2026-07-18

### Fixed

- Paystack is driven through the Inline v2 instance API and resumes
  backend-initialized transactions instead of creating a new one.
- The PSP script loader no longer touches `document` during SSR.

### Changed

- CI resolves `@reevit/core` from the npm registry instead of a `../core` link.
- CI workflows migrated to Blacksmith runners.

> Tag note: the `0.10.0` and `0.10.1` tags both point at `1a59366`, whose
> `package.json` still reads `0.10.0`. The manifest bump to `0.10.1` landed
> later, at `eae9254`.

## [0.10.0] - 2026-05-15

### Changed

- Checkout UI redesigned onto the brutalist design system: reworked
  `ReevitCheckout` and `MobileMoneyForm`, a new `LoadingState` component and a
  rewritten stylesheet.

## [0.9.0] - 2026-05-15

### Added

- Checkout session support in the Reevit store.

### Changed

- Publish workflow handles a prerelease `@reevit/core`.

## [0.8.1] - 2026-03-13

### Changed

- Re-compressed the bundled M-Pesa logo (117 KB to 6 KB).
- Payment method selector adjustment.

## [0.8.0] - 2026-03-03

### Changed

- Aligned the Hubtel callback and provider reference flow.

## [0.7.0] - 2026-02-07

Internal changes — `@reevit/core` dependency bump and version alignment across
the Reevit SDKs.

## [0.6.0] - 2026-02-04

### 🛠 Improvements

- Added `idempotencyKey` support in checkout config and intent initialization.
- Added in-flight dedupe for payment intent creation.

## [0.5.9] - 2026-01-21

### Changed

- Reworked `ReevitCheckout`, the Reevit store, the PSP bridge loaders and the
  widget stylesheet. The originating commit message does not describe the
  change further.

## [0.5.1] - 2026-01-17

### Changed

- Widget stylesheet updates.

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
