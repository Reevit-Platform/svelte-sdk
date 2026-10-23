import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentIntent, PaymentMethod } from '@reevit/core';

const packed = process.env.REEVIT_PACKED_ENTRY ? await import(/* @vite-ignore */ process.env.REEVIT_PACKED_ENTRY) : null;
const ReevitCheckout = packed ? packed.ReevitCheckout : (await import('./ReevitCheckout.svelte')).default;
const MobileMoneyForm = packed ? packed.MobileMoneyForm : (await import('./MobileMoneyForm.svelte')).default;

const SESSION_SECRET = 'cs_checkout_session_secret';

// vitest runs without globals here, so Testing Library cannot auto-clean up.
afterEach(() => {
  cleanup();
});

/** The SDK's script loader skips the network when a script with its id is already in the page. */
function ensureScript(id: string) {
  if (!document.getElementById(id)) {
    const script = document.createElement('script');
    script.id = id;
    document.head.appendChild(script);
  }
}

function installPaystackBridge() {
  ensureScript('paystack-script');
  const newTransaction = vi.fn();
  const resumeTransaction = vi.fn();
  window.PaystackPop = class {
    newTransaction = newTransaction;
    resumeTransaction = resumeTransaction;
  } as any;

  return { newTransaction, resumeTransaction };
}

const rowButton = (name: string) => screen.getByRole('button', { name });
const query = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);

/** The same fixture the React SDK's server-session test uses. */
function sessionResponse(accessCode: string, method = 'card') {
  return {
    id: 'checkout_session_payment',
    client_secret: accessCode,
    session_secret: SESSION_SECRET,
    payment_intent: {
      id: method === 'card' ? 'pay_initial_card' : 'pay_selected_mobile_money',
      org_id: 'org_123',
      connection_id: 'conn_paystack',
      provider: 'paystack',
      method,
      status: 'requires_action',
      client_secret: accessCode,
      amount: 1000,
      currency: 'GHS',
      fee_amount: 0,
      fee_currency: 'GHS',
      net_amount: 1000,
      available_psps: [
        {
          provider: 'paystack',
          name: 'Paystack',
          methods: ['card', 'mobile_money'],
        },
      ],
    },
  };
}

describe('ReevitCheckout server-created sessions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.PaystackPop;
  });

  it('renders the session amount and never creates a browser intent', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(sessionResponse('card-only-access-code')), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        sessionSecret: SESSION_SECRET,
        paymentMethods: ['card', 'mobile_money'],
      },
    });

    // The amount comes from the session's payment intent, not from any prop.
    await waitFor(() => {
      expect(query('[data-reevit="amount"]')?.textContent).toBe('GHS 10.00');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(String(url)).toContain(`/v1/checkout/sessions/${SESSION_SECRET}`);

    // No intent POST anywhere: the session secret must bypass intent creation entirely.
    for (const call of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect((call[1]?.method ?? 'GET').toUpperCase()).toBe('GET');
    }
  });



  it('opens Paystack with the shopper-selected Mobile Money intent and deduplicates repeated taps', async () => {
    const { newTransaction, resumeTransaction } = installPaystackBridge();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(sessionResponse('card-only-access-code')), { status: 200 });
      }

      return new Response(JSON.stringify({
        payment_intent: sessionResponse('mobile-money-access-code', 'mobile_money').payment_intent,
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        sessionSecret: SESSION_SECRET + '_momo',
        paymentMethods: ['card', 'mobile_money'],
        email: 'shopper@example.com',
        phone: '0241234567',
      },
    });

    const row = await screen.findByRole('button', { name: 'Mobile money' });
    row.click();
    row.click();

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith(
      'mobile-money-access-code',
      expect.any(Object),
    ));

    const selectCalls = fetchMock.mock.calls.filter(([input, init]) =>
      String(input).endsWith(`/v1/checkout/sessions/${encodeURIComponent(SESSION_SECRET + '_momo')}/select`) &&
      init?.method === 'POST',
    );
    expect(selectCalls).toHaveLength(1);
    expect(JSON.parse(String(selectCalls[0][1]?.body))).toEqual({
      method: 'mobile_money',
      provider: 'paystack',
    });
    const headers = selectCalls[0][1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^reevit_checkout_selection_[0-9a-f]{32}$/);
    expect(headers['X-Reevit-Client']).toBe('@reevit/svelte');
    expect(headers['X-Reevit-Client-Version']).toBe('0.12.1');
    expect(resumeTransaction).not.toHaveBeenCalledWith('card-only-access-code', expect.anything());
    expect(newTransaction).not.toHaveBeenCalled();
  });

  it('requests and opens a card-specific intent', async () => {
    const { resumeTransaction } = installPaystackBridge();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(sessionResponse('initial-access-code')), { status: 200 });
      }

      return new Response(JSON.stringify({
        payment_intent: sessionResponse('card-specific-access-code').payment_intent,
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        sessionSecret: SESSION_SECRET + '_card',
        paymentMethods: ['card', 'mobile_money'],
        email: 'shopper@example.com',
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Card' }));

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith(
      'card-specific-access-code',
      expect.any(Object),
    ));
    const selectCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(selectCall?.[1]?.body))).toEqual({
      method: 'card',
      provider: 'paystack',
    });
  });

  it('replays the same selection identity when the same method is tapped again after backing out', async () => {
    const { resumeTransaction } = installPaystackBridge();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(sessionResponse('initial-access-code')), { status: 200 });
      }
      return new Response(JSON.stringify({ payment_intent: sessionResponse('replay-card-code').payment_intent }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: { isOpen: true, sessionSecret: SESSION_SECRET + '_replay', paymentMethods: ['card'], email: 'shopper@example.com' },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Card' }));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledTimes(1));
    resumeTransaction.mock.calls[0][1].onCancel();
    await fireEvent.click(await screen.findByRole('button', { name: 'Card' }));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledTimes(2));

    // The second tap reuses the first selection instead of sending another.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('routes to the recommended provider when several support the method, with no processor picker', async () => {
    const { resumeTransaction } = installPaystackBridge();

    const initial = sessionResponse('initial-access-code');
    initial.payment_intent.available_psps = [
      { provider: 'flutterwave', name: 'Flutterwave', methods: ['card', 'mobile_money'] },
      { provider: 'paystack', name: 'Paystack', methods: ['card', 'mobile_money'] },
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(initial), { status: 200 });
      }

      return new Response(JSON.stringify({
        payment_intent: sessionResponse('paystack-mobile-money-code', 'mobile_money').payment_intent,
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        sessionSecret: SESSION_SECRET + '_provider',
        paymentMethods: ['card', 'mobile_money'],
        email: 'shopper@example.com',
        phone: '0241234567',
      },
    });

    await screen.findByRole('button', { name: 'Mobile money' });
    expect(screen.queryByRole('button', { name: 'Paystack' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flutterwave' })).toBeNull();

    await fireEvent.click(rowButton('Mobile money'));

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith(
      'paystack-mobile-money-code',
      expect.any(Object),
    ));
    const selectCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(selectCall?.[1]?.body))).toEqual({
      method: 'mobile_money',
      provider: 'paystack',
    });
  });

  it('never logs the shopper to the console while starting a payment', async () => {
    const { resumeTransaction } = installPaystackBridge();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify(sessionResponse('initial-access-code')), { status: 200 });
      }

      return new Response(JSON.stringify({
        payment_intent: sessionResponse('pii-card-access-code').payment_intent,
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        sessionSecret: SESSION_SECRET + '_pii',
        paymentMethods: ['card', 'mobile_money'],
        email: 'shopper@example.com',
        phone: '0241234567',
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Card' }));

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith(
      'pii-card-access-code',
      expect.any(Object),
    ));

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logSpy).not.toHaveBeenCalled();
    expect(logged).not.toContain('shopper@example.com');
    expect(logged).not.toContain('0241234567');
    expect(logged).not.toContain('pii-card-access-code');
  });

  it('keeps the existing public-key intent refresh flow working', async () => {
    const { resumeTransaction } = installPaystackBridge();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const intent = body.method === 'mobile_money'
        ? sessionResponse('public-key-mobile-money-code', 'mobile_money').payment_intent
        : sessionResponse('public-key-initial-code').payment_intent;
      return new Response(JSON.stringify(intent), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        publicKey: 'pfk_test_public_key',
        amount: 1000,
        currency: 'GHS',
        reference: 'public-key-regression',
        paymentMethods: ['card', 'mobile_money'],
        email: 'public-key-shopper@example.com',
        phone: '0241234567',
      },
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Mobile money' }));

    await waitFor(() => expect(resumeTransaction).toHaveBeenCalledWith(
      'public-key-mobile-money-code',
      expect.any(Object),
    ));
    expect(fetchMock.mock.calls.some(([, init]) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return body.method === 'mobile_money' && body.policy?.allowed_providers?.[0] === 'paystack';
    })).toBe(true);
  });
});

describe('ReevitCheckout with Hubtel', () => {
  const CHECKOUT_URL = 'https://pay.hubtel.com/9aa1';
  const DIRECT_URL = 'https://pay.hubtel.com/9aa1/direct';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.querySelectorAll('[data-reevit-hubtel-checkout]').forEach((el) => el.remove());
  });

  it('opens the hosted checkout and never asks for Hubtel credentials', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const confirmStatuses = ['requires_action', 'succeeded', 'succeeded'];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/checkout/sessions/')) {
        const session = sessionResponse(CHECKOUT_URL, 'mobile_money');
        session.payment_intent.provider = 'hubtel';
        session.payment_intent.connection_id = 'conn_hubtel';
        session.payment_intent.available_psps = [{ provider: 'hubtel', name: 'Hubtel', methods: ['mobile_money'] }];
        return new Response(JSON.stringify(session), { status: 200 });
      }
      if (url.includes('/v1/payments/hubtel/sessions/')) {
        return new Response(
          JSON.stringify({ paymentId: 'pay_selected_mobile_money', status: 'requires_action', checkoutUrl: CHECKOUT_URL, checkoutDirectUrl: DIRECT_URL, checkoutId: '9aa1' }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ id: 'pay_selected_mobile_money', status: confirmStatuses.shift() ?? 'succeeded' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, {
      props: {
        isOpen: true,
        // A distinct secret: @reevit/core caches session responses per secret.
        sessionSecret: 'cs_hubtel_session_secret',
        paymentMethods: ['mobile_money'],
        phone: '0241234567',
        successDelayMs: 0,
      },
    });

    // Mobile money is the only method, so it is the only row.
    await fireEvent.click(await screen.findByRole('button', { name: 'Mobile money' }));

    await vi.waitFor(() => {
      const iframe = document.querySelector('[data-reevit-hubtel-checkout] iframe') as HTMLIFrameElement | null;
      expect(iframe?.src).toBe(DIRECT_URL);
    });

    // Two status polls: pending, then succeeded, which closes the frame.
    await vi.advanceTimersByTimeAsync(8000);
    await vi.waitFor(() => expect(document.querySelector('[data-reevit-hubtel-checkout]')).toBeNull());

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/v1/payments/hubtel/sessions/pay_selected_mobile_money'))).toBe(true);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/confirm-intent')).length).toBeGreaterThanOrEqual(3)
    );
    expect(document.body.innerHTML).not.toContain('basicAuth');
  });
});

describe('ReevitCheckout with Flutterwave', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.FlutterwaveCheckout;
  });

  it.each([
    ['GHS', 5012, 50.12],
    ['NGN', 5012, 50.12],
    ['XOF', 5000, 5000],
    ['XAF', 5000, 5000],
  ])('converts the %s intent amount only at the gateway boundary', async (currency, minor, major) => {
    const checkout = vi.fn();
    window.FlutterwaveCheckout = checkout;
    ensureScript('flutterwave-script');
    const session = sessionResponse('flutterwave-secret');
    session.payment_intent.amount = minor;
    session.payment_intent.currency = currency;
    session.payment_intent.provider = 'flutterwave';
    session.payment_intent.available_psps = [{ provider: 'flutterwave', name: 'Flutterwave', methods: ['card'] }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })));

    render(ReevitCheckout, { props: {
      isOpen: true, sessionSecret: `cs_flutterwave_${currency}`, paymentMethods: ['card'], email: 'shopper@example.com',
    } });
    await fireEvent.click(await screen.findByRole('button', { name: 'Card' }));

    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(1));
    expect(checkout.mock.calls[0][0]).toMatchObject({ amount: major, currency });
  });
});

function mockIntent(
  providers: { provider: string; name: string; methods: PaymentMethod[] }[],
  recommendedPsp: PaymentIntent['recommendedPsp'] = 'paystack',
): PaymentIntent {
  return {
    id: 'pay_mock_1',
    clientSecret: 'cs_mock_1',
    amount: 75500,
    currency: 'GHS',
    status: 'pending',
    recommendedPsp,
    availableMethods: ['card', 'mobile_money', 'bank_transfer'],
    availableProviders: providers,
  };
}

const ALL_METHODS: PaymentMethod[] = ['card', 'mobile_money', 'bank_transfer'];

function rowLabels() {
  return Array.from(document.querySelectorAll('[data-reevit="row"] .reevit-row-label')).map((n) => n.textContent);
}

describe('ReevitCheckout method list and routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.PaystackPop;
    delete window.FlutterwaveCheckout;
  });

  it('shows the union of methods across providers, in card, mobile money, bank order', () => {
    render(ReevitCheckout, { props: {
      isOpen: true,
      publicKey: 'pfk_test',
      paymentMethods: ALL_METHODS,
      initialPaymentIntent: mockIntent([
        { provider: 'monnify', name: 'Monnify', methods: ['bank_transfer'] },
        { provider: 'paystack', name: 'Paystack', methods: ['card'] },
        { provider: 'flutterwave', name: 'Flutterwave', methods: ['mobile_money', 'card'] },
      ]),
    } });

    expect(rowLabels()).toEqual(['Card', 'Mobile money', 'Bank transfer']);
    expect(screen.queryByRole('button', { name: /Paystack|Flutterwave|Monnify/ })).toBeNull();
  });

  it('only lists methods the merchant allowed and Hubtel can take', () => {
    render(ReevitCheckout, { props: {
      isOpen: true,
      publicKey: 'pfk_test',
      paymentMethods: ALL_METHODS,
      initialPaymentIntent: mockIntent(
        [{ provider: 'hubtel', name: 'Hubtel', methods: ['card', 'mobile_money', 'bank_transfer'] }],
        'hubtel',
      ),
    } });

    expect(rowLabels()).toEqual(['Card', 'Mobile money']);
  });

  it('falls back to the first provider that supports the method when the recommended one does not', async () => {
    ensureScript('flutterwave-script');
    const flutterwave = vi.fn();
    window.FlutterwaveCheckout = flutterwave;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    render(ReevitCheckout, { props: {
      isOpen: true,
      publicKey: 'pfk_test',
      paymentMethods: ALL_METHODS,
      email: 'shopper@example.com',
      initialPaymentIntent: mockIntent([
        { provider: 'paystack', name: 'Paystack', methods: ['card'] },
        { provider: 'flutterwave', name: 'Flutterwave', methods: ['mobile_money'] },
      ], 'paystack'),
    } });

    await fireEvent.click(rowButton('Mobile money'));
    await waitFor(() => expect(flutterwave).toHaveBeenCalledTimes(1));
    expect(query('[data-reevit="footer-logo"]')?.getAttribute('data-provider')).toBe('flutterwave');
  });

  it('shows the recommended provider in the footer before a method is picked', () => {
    render(ReevitCheckout, { props: {
      isOpen: true,
      publicKey: 'pfk_test',
      paymentMethods: ALL_METHODS,
      initialPaymentIntent: mockIntent([
        { provider: 'paystack', name: 'Paystack', methods: ['card'] },
        { provider: 'monnify', name: 'Monnify', methods: ['bank_transfer'] },
      ], 'monnify'),
    } });

    expect(query('[data-reevit="footer-logo"]')?.getAttribute('data-provider')).toBe('monnify');
  });

  it('shows the Opening line and a back chevron while the provider window is open, and returns to the list when it is dismissed', async () => {
    const { resumeTransaction } = installPaystackBridge();
    render(ReevitCheckout, { props: {
      isOpen: true,
      publicKey: 'pfk_test',
      paymentMethods: ALL_METHODS,
      initialPaymentIntent: mockIntent([{ provider: 'paystack', name: 'Paystack', methods: ['card'] }]),
    } });

    await fireEvent.click(rowButton('Card'));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled());
    expect(query('[data-reevit="status"]')?.textContent).toBe('Opening Paystack…');
    expect(query('[data-reevit="panel-title"]')?.textContent).toBe('Card');
    expect(query('[data-reevit="back"]')).not.toBeNull();

    // The provider reports the shopper dismissed its window.
    resumeTransaction.mock.calls[0][1].onCancel();
    await waitFor(() => expect(query('[data-reevit="list"]')).not.toBeNull());
  });

  it('shows the failure panel, without resetting the intent, when the provider window errors', async () => {
    const { resumeTransaction } = installPaystackBridge();
    const onError = vi.fn();
    render(ReevitCheckout, {
      props: {
        isOpen: true,
        publicKey: 'pfk_test',
        paymentMethods: ['card'],
        initialPaymentIntent: mockIntent([{ provider: 'paystack', name: 'Paystack', methods: ['card'] }]),
      },
      events: { error: onError },
    });

    await fireEvent.click(rowButton('Card'));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled());
    resumeTransaction.mock.calls[0][1].onError({ message: 'Provider went away' });

    await waitFor(() => expect(query('[data-reevit="failure"]')).not.toBeNull());
    expect(query('[data-reevit="failure"]')?.textContent).toContain('Provider went away');
    expect(onError).toHaveBeenCalledTimes(1);

    await fireEvent.click(rowButton('Try again'));
    await waitFor(() => expect(query('[data-reevit="list"]')).not.toBeNull());
  });
});

describe('ReevitCheckout receipt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.PaystackPop;
  });

  async function payThroughPaystack(props: Record<string, unknown>, events: Record<string, (e: CustomEvent) => void>) {
    const { resumeTransaction } = installPaystackBridge();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'pay_mock_1', status: 'succeeded' }), { status: 200 })));
    render(ReevitCheckout, {
      props: {
        isOpen: true,
        publicKey: 'pfk_test',
        paymentMethods: ['card'],
        initialPaymentIntent: mockIntent([{ provider: 'paystack', name: 'Paystack', methods: ['card'] }]),
        ...props,
      },
      events,
    });
    await fireEvent.click(rowButton('Card'));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled());
    resumeTransaction.mock.calls[0][1].onSuccess({ reference: 'ref_123', trans: '1', status: 'success', message: 'ok', transaction: 'txn_1', trxref: 'ref_123' });
    await screen.findByText('Payment received');
  }

  it('shows reference, method, provider and date, then Done fires onSuccess exactly once and closes', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    await payThroughPaystack({}, { success: onSuccess, close: onClose });

    const receipt = query('[data-reevit="receipt"]') as HTMLElement;
    expect(receipt.textContent).toContain('ref_123');
    expect(receipt.textContent).toContain('Card');
    expect(receipt.textContent).toContain('Paystack');
    expect(onSuccess).not.toHaveBeenCalled(); // still inside the success delay

    await fireEvent.click(query('[data-reevit="done"]') as HTMLElement);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].detail).toMatchObject({ reference: 'ref_123', paymentMethod: 'card' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(query('[data-reevit="root"]')).toBeNull();

    // Closing again, or letting the timer run, must not deliver the result a second time.
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after successDelayMs and still fires onSuccess only once', async () => {
    const onSuccess = vi.fn();
    await payThroughPaystack({ successDelayMs: 60 }, { success: onSuccess });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(query('[data-reevit="root"]')).toBeNull());

    await new Promise((r) => setTimeout(r, 120));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('delivers the result when the receipt is closed with the X before the delay ends', async () => {
    const onSuccess = vi.fn();
    await payThroughPaystack({}, { success: onSuccess });
    await fireEvent.click(query('[data-reevit="close"]') as HTMLElement);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('ReevitCheckout closing, focus and keyboard', () => {
  beforeEach(() => {
    // Closing cancels the pending intent; answer that call instead of hitting the network.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.PaystackPop;
  });

  const intent = () => mockIntent([{ provider: 'paystack', name: 'Paystack', methods: ['card', 'mobile_money'] }]);
  const props = () => ({ publicKey: 'pfk_test', paymentMethods: ['card', 'mobile_money'], initialPaymentIntent: intent() });

  it('closes straight away from the list, without a confirmation', async () => {
    const onClose = vi.fn();
    render(ReevitCheckout, { props: { isOpen: true, ...props() }, events: { close: onClose } });

    await fireEvent.click(query('[data-reevit="close"]') as HTMLElement);
    expect(query('[data-reevit="confirm"]')).toBeNull();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('asks before leaving while a provider window is open, and Keep paying stays', async () => {
    const { resumeTransaction } = installPaystackBridge();
    const onClose = vi.fn();
    render(ReevitCheckout, { props: { isOpen: true, ...props() }, events: { close: onClose } });
    await fireEvent.click(rowButton('Card'));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled());

    await fireEvent.click(query('[data-reevit="close"]') as HTMLElement);
    const confirm = query('[data-reevit="confirm"]');
    expect(confirm).not.toBeNull();
    expect(confirm?.getAttribute('role')).toBe('alertdialog');
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.click(query('[data-reevit="stay"]') as HTMLElement);
    expect(query('[data-reevit="confirm"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.click(query('[data-reevit="close"]') as HTMLElement);
    await fireEvent.click(query('[data-reevit="leave"]') as HTMLElement);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('moves focus to the first method, traps Tab, closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    render(ReevitCheckout, { props: props(), events: { close: onClose } });
    const opener = screen.getByRole('button', { name: /Pay/ });
    opener.focus();
    await fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe(query('[data-reevit="title"]')?.id);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-reevit="row"]'));
    await waitFor(() => expect(document.activeElement).toBe(rows[0]));

    // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last.
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button'));
    controls[controls.length - 1].focus();
    await fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(controls[0]);
    await fireEvent.keyDown(document.activeElement as Element, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(controls[controls.length - 1]);

    await fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(opener);
  });

  it('announces the current view in a polite live region', async () => {
    render(ReevitCheckout, { props: { isOpen: true, ...props() } });
    const live = query('[data-reevit="live"]') as HTMLElement;
    expect(live.getAttribute('aria-live')).toBe('polite');
    await waitFor(() => expect(live.textContent).toBe('Choose a payment method'));
  });
});

describe('ReevitCheckout M-Pesa', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const kenyaProps = () => ({
    isOpen: true,
    publicKey: 'pfk_test',
    paymentMethods: ['mobile_money'],
    initialPaymentIntent: {
      ...mockIntent([{ provider: 'mpesa', name: 'M-Pesa', methods: ['mobile_money'] }], 'mpesa'),
      currency: 'KES',
    },
  });

  it('asks for the number when M-Pesa is the only method, then waits for the approval (the push is sent server-side)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ status: 'pending' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(ReevitCheckout, { props: kenyaProps() });

    // One method, so there is no list and no back button: straight to the number.
    expect(query('[data-reevit="list"]')).toBeNull();
    expect(query('[data-reevit="back"]')).toBeNull();

    const input = screen.getByLabelText('M-Pesa number') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '712345678' } });
    expect(input.value).toBe('712 345 678');
    await fireEvent.click(screen.getByRole('button', { name: 'Pay KES 755.00' }));

    await screen.findByText('Approve on your phone');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/mpesa'))).toBe(false);
  });

  it('rejects a number that is not a Kenyan mobile', async () => {
    render(ReevitCheckout, { props: kenyaProps() });

    await fireEvent.input(screen.getByLabelText('M-Pesa number'), { target: { value: '512345678' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Pay KES 755.00' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid M-Pesa number');
  });
});

describe('ReevitCheckout failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.PaystackPop;
  });

  it('shows the failure panel with Try again when confirming the payment fails', async () => {
    const { resumeTransaction } = installPaystackBridge();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Card declined' }), { status: 402 })));
    const onError = vi.fn();
    render(ReevitCheckout, {
      props: {
        isOpen: true,
        publicKey: 'pfk_test',
        paymentMethods: ['card'],
        initialPaymentIntent: mockIntent([{ provider: 'paystack', name: 'Paystack', methods: ['card'] }]),
      },
      events: { error: onError },
    });
    await fireEvent.click(rowButton('Card'));
    await waitFor(() => expect(resumeTransaction).toHaveBeenCalled());
    resumeTransaction.mock.calls[0][1].onSuccess({ reference: 'ref_x', trans: '1', status: 'success', message: 'ok', transaction: 't', trxref: 'ref_x' });

    const failure = await waitFor(() => {
      const el = query('[data-reevit="failure"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(failure.textContent).toContain('Payment failed');
    expect(onError).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(query('[data-reevit="list"]')).not.toBeNull());
  });
});

describe('MobileMoneyForm (Ghana)', () => {
  it('detects the network from the number, validates, and submits digits plus network', async () => {
    const onSubmit = vi.fn();
    render(MobileMoneyForm, { props: { submitLabel: 'Pay GHS 755.00', hideCancel: true }, events: { submit: onSubmit } });

    // Nothing typed: the number is rejected.
    await fireEvent.click(screen.getByRole('button', { name: 'Pay GHS 755.00' }));
    expect(screen.getByRole('alert').textContent).toContain('10-digit');
    expect(onSubmit).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Mobile money number') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '0244128890' } });
    expect(input.value).toBe('024 412 8890');
    expect(screen.getByRole('button', { name: 'MTN' }).getAttribute('aria-pressed')).toBe('true');

    // A manual pick of another network is rejected when the number belongs to MTN.
    await fireEvent.click(screen.getByRole('button', { name: 'Telecel' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Pay GHS 755.00' }));
    expect(screen.getByRole('alert').textContent).toContain('doesn’t match');

    await fireEvent.click(screen.getByRole('button', { name: 'MTN' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Pay GHS 755.00' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].detail).toEqual({ phone: '0244128890', network: 'mtn' });
  });
});
