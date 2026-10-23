/**
 * Parity harness stubs: mock intents and NO network calls (providers, Stripe.js and
 * fetch are stubbed here only). Imported before the widget so the SDK finds them.
 */
export const params = new URLSearchParams(location.search);
export const state = params.get('state') || 'list';
export const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
/** Reevit's own mobile money screens, driven through a stubbed session + direct charge API. */
export const direct = state.startsWith('momo');
/** Reevit's own bank transfer screens, same session, frozen clock. */
export const bankState = state.startsWith('bank');

export const PROVIDERS = {
  paystack: { name: 'Paystack', methods: ['card', 'mobile_money', 'bank_transfer'], currency: 'GHS' },
  hubtel: { name: 'Hubtel', methods: ['card', 'mobile_money'], currency: 'GHS' },
  flutterwave: { name: 'Flutterwave', methods: ['card', 'mobile_money', 'bank_transfer'], currency: 'GHS' },
  monnify: { name: 'Monnify', methods: ['card', 'bank_transfer'], currency: 'NGN' },
  mpesa: { name: 'M-Pesa', methods: ['mobile_money'], currency: 'KES' },
  stripe: { name: 'Stripe', methods: ['card'], currency: 'USD' },
} as const;

export type ProviderId = keyof typeof PROVIDERS;
export const provider = (params.get('provider') ||
  (state.startsWith('mpesa') || state === 'momo-mpesa-wait' ? 'mpesa' : state === 'stripe' ? 'stripe' : 'paystack')) as ProviderId;

const cfg = PROVIDERS[provider];
export const currency = params.get('currency') || (provider === 'monnify' ? 'NGN' : cfg.currency === 'USD' ? 'GHS' : cfg.currency);
export const amount = 75500; // GHS 755.00 in minor units

export const intent = {
  id: 'pay_preview_1',
  clientSecret: 'cs_preview_1',
  pspPublicKey: 'pk_preview',
  amount,
  currency,
  status: 'pending' as const,
  recommendedPsp: provider,
  availableMethods: ['card', 'mobile_money', 'bank_transfer'] as ('card' | 'mobile_money' | 'bank_transfer')[],
  availableProviders: [{ provider, name: cfg.name, methods: [...cfg.methods] as ('card' | 'mobile_money' | 'bank_transfer')[] }],
};

const never = new Promise<Response>(() => {});
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

// What `GET /v1/checkout/sessions/{secret}` answers: the original payment, with per-method flow.
const intentResponse = {
  id: 'pay_preview_session',
  org_id: 'org_preview',
  connection_id: 'conn_preview',
  provider,
  status: 'pending',
  client_secret: 'pfsec_session',
  amount,
  currency,
  fee_amount: 0,
  fee_currency: currency,
  net_amount: amount,
  available_psps: [
    {
      provider,
      name: cfg.name,
      methods: provider === 'mpesa' ? ['mobile_money'] : ['card', 'mobile_money', 'bank_transfer'],
      method_options: [
        provider === 'mpesa'
          ? { method: 'mobile_money', flow: 'direct', networks: ['mpesa'], needs: ['phone'] }
          : { method: 'mobile_money', flow: 'direct', networks: ['mtn', 'telecel', 'airteltigo'], needs: ['phone', 'network'], voucher_networks: ['telecel'] },
        { method: 'card', flow: 'hosted', networks: [], needs: [] },
        { method: 'bank_transfer', flow: 'direct', networks: [], needs: [] },
      ],
    },
  ],
};

// A frozen clock makes the countdown, the bar and the Resend cooldown the same in every shot.
let clock = Date.parse('2026-10-23T12:00:00Z');
if (direct || bankState) Date.now = () => clock;
const at = (offsetMs: number) => new Date(clock + offsetMs).toISOString();
const kesPreview = currency === 'KES';

function directView(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: 'pending',
    amount,
    currency,
    method: 'mobile_money',
    provider_display: cfg.name,
    client_secret: 'pfsec_preview',
    next_action: {
      type: 'mobile_money_prompt',
      network: kesPreview ? 'mpesa' : 'mtn',
      phone_masked: kesPreview ? '+254 712 ••• 678' : '024 ••• 8890',
      // The prototype's fast mode runs a 12 s window.
      expires_at: at(12_000),
      attempt: { n: 1, max: 3 },
      can_resend_at: at(-1000),
    },
    rerouted: false,
    poll_after_ms: 2000,
    ...over,
  };
}

const failedDirect = (code: string, category: string) =>
  directView('pay_preview_direct', { status: 'failed', next_action: undefined, poll_after_ms: 0, failure: { code, category, retryable: true, message: 'server wording' } });

function directCharge() {
  switch (state) {
    case 'momo-declined': return failedDirect('not_approved', 'not_approved');
    case 'momo-insufficient': return failedDirect('insufficient_funds', 'insufficient_funds');
    case 'momo-otp':
      return directView('pay_preview_direct', { status: 'requires_action', next_action: { type: 'otp', network: 'mtn', phone_masked: '024 ••• 8890', expires_at: at(120_000), attempt: { n: 1, max: 3 } } });
    case 'momo-voucher':
      return directView('pay_preview_direct', { status: 'requires_action', next_action: { type: 'voucher', network: 'telecel', phone_masked: '020 ••• 8890', expires_at: at(120_000), attempt: { n: 1, max: 3 }, voucher: { ussd: '*110#' } } });
    case 'momo-failover': return directView('pay_preview_direct', { rerouted: true });
    case 'momo-failover-success': return directView('pay_preview_direct', { status: 'succeeded', next_action: undefined, poll_after_ms: 0, rerouted: true });
    case 'momo-timeout': return directView('pay_preview_direct', { next_action: { ...directView('x').next_action, expires_at: at(400) } });
    default: return directView('pay_preview_direct');
  }
}

/** What a provider returns for a one-off account; the name is absent for Flutterwave Ghana. */
const secondsLeft = Number(params.get('expires') || 17);
function bankView(over: Record<string, unknown> = {}, expiresInMs = secondsLeft * 1000) {
  const account = {
    bank: 'Wema Bank',
    account_number: '7820194552',
    ...(state === 'bank-no-name' ? {} : { account_name: 'Reevit / Kente & Co.' }),
    amount,
    expires_at: at(expiresInMs),
  };
  return {
    id: 'pay_preview_bank',
    status: 'requires_action',
    amount,
    currency,
    method: 'bank_transfer',
    provider_display: cfg.name,
    client_secret: 'pfsec_preview_bank',
    next_action: { type: 'bank_transfer', expires_at: account.expires_at, bank: account, attempt: { n: 1, max: 3 } },
    rerouted: false,
    poll_after_ms: 5000,
    ...over,
  };
}

window.fetch = ((input: RequestInfo | URL) => {
  const url = String(input);
  if (bankState) {
    if (url.includes('/v1/checkout/sessions/') && url.endsWith('/charge')) return json(bankView({}, state === 'bank-expired' ? -1000 : undefined));
    if (url.includes('/v1/checkout/sessions/')) return json({ id: 'sess', client_secret: 'x', session_secret: 'cs_preview', payment_intent: intentResponse });
    if (url.includes('/status')) {
      if (state === 'bank-expired') {
        return json(bankView({ status: 'expired', next_action: undefined, client_secret: undefined, poll_after_ms: 0, failure: { code: 'expired', category: 'timeout', retryable: true, message: 'x' } }));
      }
      // "Confirming your transfer" stays on screen while the check never answers.
      if (state === 'bank-confirming' && url.includes('check=1')) return never;
      return json(bankView({ client_secret: undefined }));
    }
  }
  if (direct) {
    if (url.includes('/v1/checkout/sessions/') && url.endsWith('/charge')) {
      // One second and three quarters into the window: "0:11" with the bar where the prototype shot has it.
      if (state === 'momo-wait' || state === 'momo-failover' || state === 'momo-mpesa-wait') setTimeout(() => { clock += 1750; }, 80);
      return json(directCharge());
    }
    if (url.includes('/v1/checkout/sessions/')) return json({ id: 'sess', client_secret: 'x', session_secret: 'cs_preview', payment_intent: intentResponse });
    if (url.endsWith('/status')) return json(directView('pay_preview_direct', { client_secret: undefined }));
  }
  if (url.includes('/confirm-intent')) {
    if (state === 'processing') return never;
    if (state === 'failure') return json({ message: 'Your card was declined. Try another card.' }, 402);
    return json({ id: 'pay_preview_1', status: 'succeeded', provider_ref_id: 'pay_wrvrzjvp' });
  }
  if (url.endsWith('/mpesa')) {
    if (state === 'mpesa-failed') return json({ message: 'The request could not be sent. Try again.' }, 500);
    return json({ checkout_request_id: 'ws_CO_2310202611570001' });
  }
  if (state === 'loading') return never;
  return json({});
}) as typeof fetch;

// The SDK's script loader skips the network when a script with its id is already in the page.
for (const id of ['paystack-script', 'stripe-script']) {
  const el = document.createElement('script');
  el.id = id;
  document.head.append(el);
}

const pending = state === 'opening' || state === 'confirm';
(window as any).PaystackPop = class {
  newTransaction() {}
  resumeTransaction(_code: string, cb: { onSuccess?: (r: unknown) => void }) {
    if (pending) return; // provider window stays open
    queueMicrotask(() => cb.onSuccess?.({ reference: 'pay_wrvrzjvp', trans: '1', status: 'success', message: 'ok', transaction: 'txn_1', trxref: 'pay_wrvrzjvp' }));
  }
};

// Stripe: a stand-in for the Payment Element that follows the appearance object the SDK passes in.
type Appearance = { variables?: Record<string, string>; rules?: Record<string, Record<string, string>> };
(window as any).Stripe = () => ({
  elements: ({ appearance }: { appearance?: Appearance }) => ({
    create: () => {
      let host: HTMLElement | null = null;
      const v = appearance?.variables ?? {};
      const input = appearance?.rules?.['.Input'] ?? {};
      const label = appearance?.rules?.['.Label'] ?? {};
      const field = (name: string, placeholder: string) =>
        `<div style="margin-bottom:${v.spacingGridRow}"><div style="font-size:${label.fontSize};font-weight:${label.fontWeight};margin-bottom:${label.marginBottom};color:${label.color}">${name}</div>` +
        `<div style="height:${input.height};padding:0 14px;display:flex;align-items:center;border:${input.border};border-radius:${v.borderRadius};background:${input.backgroundColor};font-size:${input.fontSize};color:${v.colorTextPlaceholder}">${placeholder}</div></div>`;
      return {
        mount(el: HTMLElement) {
          host = el;
          el.style.fontFamily = v.fontFamily ?? '';
          el.innerHTML = field('Card number', '1234 1234 1234 1234') +
            `<div style="display:grid;grid-template-columns:1fr 1fr;gap:${v.spacingGridColumn}">${field('Expiration date', 'MM / YY')}${field('Security code', 'CVC')}</div>`;
        },
        unmount() {},
        destroy() { if (host) host.innerHTML = ''; },
        on(event: string, handler: () => void) { if (event === 'ready') setTimeout(handler, 0); },
      };
    },
    submit: async () => ({}),
    getElement: () => null,
  }),
  confirmPayment: async () => ({ paymentIntent: { id: 'pi_preview', status: 'succeeded' } }),
});
