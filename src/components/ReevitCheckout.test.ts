import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReevitCheckout from './ReevitCheckout.svelte';

const SESSION_SECRET = 'cs_checkout_session_secret';

// vitest runs without globals here, so Testing Library cannot auto-clean up.
afterEach(() => {
  cleanup();
});

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
      expect(screen.getByText(/GH.*10\.00/)).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(String(url)).toContain(`/v1/checkout/sessions/${SESSION_SECRET}`);

    // No intent POST anywhere: the session secret must bypass intent creation entirely.
    for (const call of fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>) {
      expect((call[1]?.method ?? 'GET').toUpperCase()).toBe('GET');
    }
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

    // The only method is preselected; the modal overlay also has role=button,
    // so target the action by its text.
    const makePayment = (await screen.findByText('MAKE PAYMENT')).closest('button') as HTMLButtonElement;
    await vi.waitFor(() => expect(makePayment.disabled).toBe(false));
    await fireEvent.click(makePayment);

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
