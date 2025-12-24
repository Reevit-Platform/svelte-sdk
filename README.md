# @reevit/svelte

Svelte SDK for integrating Reevit unified payments into your application.

## Installation

```bash
npm install @reevit/svelte @reevit/core
```

## Quick Start

The simplest way to integrate Reevit is using the `ReevitCheckout` component.

```svelte
<script lang="ts">
  import { ReevitCheckout } from '@reevit/svelte';
  import '@reevit/svelte/styles.css';

  const handleSuccess = (event) => {
    console.log('Payment success!', event.detail);
  };

  const handleError = (event) => {
    console.error('Payment failed:', event.detail);
  };
</script>

<ReevitCheckout
  publicKey="pk_test_xxx"
  amount={10000}
  currency="GHS"
  email="customer@example.com"
  on:success={handleSuccess}
  on:error={handleError}
>
  <button slot="default" let:handleOpen let:isLoading on:click={handleOpen} disabled={isLoading}>
    {isLoading ? 'Loading...' : 'Pay GHS 100.00'}
  </button>
</ReevitCheckout>
```

## Custom Theme

```svelte
<ReevitCheckout
  theme={{
    primaryColor: '#FF3E00',
    backgroundColor: '#FFFFFF',
    borderRadius: '10px'
  }}
  publicKey="pk_test_xxx"
  amount={5000}
  currency="GHS"
>
  <button on:click={handleOpen}>Secure Pay</button>
</ReevitCheckout>
```

## Advanced Usage: createReevitStore

For full control over the payment flow, use the `createReevitStore` factory.

```svelte
<script lang="ts">
  import { createReevitStore } from '@reevit/svelte';

  const store = createReevitStore({
    config: {
      publicKey: 'pk_test_xxx',
      amount: 5000,
      currency: 'GHS',
    },
    onSuccess: (res) => console.log('Payment done!', res),
  });

  $: state = $store;
</script>

<button on:click={() => store.initialize()}>Start Payment</button>

{#if state.status === 'ready'}
  <button on:click={() => store.selectMethod('card')}>Card</button>
  <button on:click={() => store.selectMethod('mobile_money')}>Mobile Money</button>
{/if}
```

## Props Reference

| Prop | Type | Description |
|------|------|-------------|
| `publicKey` | `string` | Your project's public key |
| `amount` | `number` | Amount in smallest unit |
| `currency` | `string` | 3-letter currency code |
| `email` | `string` | Customer's email |
| `theme` | `ReevitTheme` | Customization options |
| `isOpen` | `boolean` | Control modal visibility manually |

## Events

- `on:success` - `CustomEvent<PaymentResult>`
- `on:error` - `CustomEvent<PaymentError>`
- `on:close` - `CustomEvent<void>`

## PSP Bridge Functions

For advanced use cases, you can use PSP bridge functions directly.

### Stripe

```ts
import { createStripeInstance, confirmStripePayment } from '@reevit/svelte';

const stripe = await createStripeInstance('pk_test_xxx');
const elements = stripe.elements({ clientSecret: 'pi_xxx_secret_xxx' });
const paymentElement = elements.create('payment');
paymentElement.mount('#payment-element');

// Later, confirm payment
await confirmStripePayment({
  publishableKey: 'pk_test_xxx',
  clientSecret: 'pi_xxx_secret_xxx',
  elements,
  onSuccess: (result) => console.log('Paid:', result.paymentIntentId),
  onError: (err) => console.error(err.message),
});
```

### Monnify (Nigeria)

```ts
import { openMonnifyModal } from '@reevit/svelte';

await openMonnifyModal({
  apiKey: 'MK_TEST_xxx',
  contractCode: '1234567890',
  amount: 5000,
  currency: 'NGN',
  reference: 'TXN_12345',
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  onSuccess: (result) => console.log('Paid:', result.transactionReference),
  onClose: () => console.log('Closed'),
});
```

### M-Pesa (Kenya/Tanzania)

```ts
import { initiateMPesaSTKPush } from '@reevit/svelte';

const result = await initiateMPesaSTKPush(
  {
    phoneNumber: '254712345678',
    amount: 500,
    reference: 'TXN_12345',
    onInitiated: () => console.log('STK Push sent'),
    onSuccess: (result) => console.log('Paid:', result.transactionId),
    onError: (err) => console.error(err.message),
  },
  '/api/mpesa/stk-push'
);
```

## License

MIT © Reevit
