import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectCharge, DirectFailure } from '../direct/directCharge';
import { formatPayerPhone } from '../direct/format';
import MomoFailurePanel from './MomoFailurePanel.svelte';
import MomoWaitPanel from './MomoWaitPanel.svelte';
import MomoCodePanel from './MomoCodePanel.svelte';

afterEach(cleanup);

function charge(over: Partial<DirectCharge> = {}): DirectCharge {
  return {
    phase: 'failed',
    attempt: null,
    input: { phone: '0244128890', network: 'mtn' },
    expiresAt: null,
    startedAt: null,
    canResendAt: null,
    failure: null,
    notice: null,
    formNotice: null,
    checking: false,
    resending: false,
    resendClosed: false,
    codeError: null,
    codeKind: null,
    start: vi.fn(),
    check: vi.fn(),
    resend: vi.fn(),
    submitCode: vi.fn(),
    useAnotherNumber: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
    ...over,
  } as DirectCharge;
}

const failure = (over: Partial<DirectFailure>): DirectFailure => ({
  kind: 'declined',
  title: 'Payment declined',
  message: 'The request wasn’t approved on your phone.',
  retryable: true,
  code: 'declined',
  ...over,
});

const panel = (c: DirectCharge, f: DirectFailure, extra: { canChooseAnother?: boolean; onChooseAnother?: () => void; onClose?: () => void } = {}) => ({
  charge: c,
  failure: f,
  canChooseAnother: extra.canChooseAnother ?? false,
  onChooseAnother: extra.onChooseAnother ?? vi.fn(),
  onClose: extra.onClose ?? vi.fn(),
});

describe('formatPayerPhone', () => {
  it('formats Ghana and Kenya numbers the way the form shows them', () => {
    expect(formatPayerPhone('0244128890')).toBe('024 412 8890');
    expect(formatPayerPhone('233244128890')).toBe('024 412 8890');
    expect(formatPayerPhone('254712345678')).toBe('+254 712 345 678');
  });
});

describe('MomoFailurePanel', () => {
  it('declined: Try again retries, Use another number goes back to the form', async () => {
    const c = charge();
    render(MomoFailurePanel, { props: panel(c, failure({}), { canChooseAnother: true }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(c.retry).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Use another number' }));
    expect(c.useAnotherNumber).toHaveBeenCalled();
  });

  it('timeout: the primary action sends a new prompt', async () => {
    const c = charge();
    render(MomoFailurePanel, {
      props: panel(c, failure({ kind: 'timeout', title: 'No response in time', message: 'The approval prompt expired.' })),
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send a new prompt' }));
    expect(c.resend).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Choose another method' })).toBeNull();
  });

  it('timeout with the resend budget spent falls back to Try again', () => {
    render(MomoFailurePanel, { props: panel(charge({ resendClosed: true }), failure({ kind: 'timeout' })) });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('out of attempts: no retry, only a way out', async () => {
    const onChooseAnother = vi.fn();
    const exhausted = failure({ kind: 'exhausted', retryable: false, title: 'No more attempts' });
    const first = render(MomoFailurePanel, { props: panel(charge(), exhausted, { canChooseAnother: true, onChooseAnother }) });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use another number' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Choose another method' }));
    expect(onChooseAnother).toHaveBeenCalled();
    first.unmount();

    const onClose = vi.fn();
    render(MomoFailurePanel, { props: panel(charge(), exhausted, { canChooseAnother: false, onChooseAnother, onClose }) });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server line from a refused retry', () => {
    render(MomoFailurePanel, {
      props: panel(charge({ notice: 'Your earlier payment prompt is still active.' }), failure({})),
    });
    expect(screen.getByRole('status').textContent).toBe('Your earlier payment prompt is still active.');
  });
});

describe('MomoCodePanel', () => {
  const otp = (over: Partial<DirectCharge> = {}) =>
    charge({
      phase: 'code',
      codeKind: 'otp',
      attempt: { id: 'pay_1', status: 'requires_action', amount: 1, currency: 'GHS', rerouted: false, poll_after_ms: 2000, next_action: { type: 'otp', phone_masked: '024 ••• 8890' } },
      ...over,
    });

  it('has no visible label: the field is named by aria-label only', () => {
    const { container } = render(MomoCodePanel, { props: { charge: otp() } });
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByLabelText('Code')).toBeTruthy();
    expect(screen.getByText('024 ••• 8890')).toBeTruthy();
  });

  it('keeps digits only, enables Continue from four, and submits the digits', async () => {
    const c = otp();
    render(MomoCodePanel, { props: { charge: c } });
    const input = screen.getByLabelText('Code') as HTMLInputElement;
    const cta = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    await fireEvent.input(input, { target: { value: '12a3' } });
    expect(input.value).toBe('123');
    expect(cta.disabled).toBe(true);
    await fireEvent.input(input, { target: { value: '123456' } });
    expect(cta.disabled).toBe(false);
    await fireEvent.click(cta);
    expect(c.submitCode).toHaveBeenCalledWith('123456');
  });

  it('voucher: names the field "Voucher code" and shows the dial code only when there is one', () => {
    const attempt = (voucher?: { ussd?: string }) => ({
      id: 'pay_1', status: 'requires_action', amount: 1, currency: 'GHS', rerouted: false, poll_after_ms: 2000,
      next_action: { type: 'voucher', phone_masked: '020 ••• 8890', ...(voucher ? { voucher } : {}) },
    });
    const withDial = render(MomoCodePanel, { props: { charge: otp({ codeKind: 'voucher', attempt: attempt({ ussd: '*110#' }) as DirectCharge['attempt'] }) } });
    expect(screen.getByLabelText('Voucher code')).toBeTruthy();
    expect(screen.getByText('*110#')).toBeTruthy();
    withDial.unmount();
    const { container } = render(MomoCodePanel, { props: { charge: otp({ codeKind: 'voucher', attempt: attempt() as DirectCharge['attempt'] }) } });
    expect(container.textContent).not.toContain('Dial');
  });

  it('shows the wrong-code line as an alert', () => {
    render(MomoCodePanel, { props: { charge: otp({ codeError: 'That code wasn’t accepted.' }) } });
    expect(screen.getByRole('alert').textContent).toBe('That code wasn’t accepted.');
  });
});

describe('MomoWaitPanel', () => {
  it('"I’ve approved" is a status read; Resend is disabled while the cooldown runs', async () => {
    const at = Date.parse('2026-10-23T12:00:00Z');
    const c = charge({
      phase: 'waiting',
      expiresAt: at + 120_000,
      startedAt: at,
      canResendAt: at + 30_000,
      attempt: { id: 'pay_1', status: 'pending', amount: 1, currency: 'GHS', rerouted: false, poll_after_ms: 2000 },
    });
    render(MomoWaitPanel, { props: { charge: c, phoneText: '024 412 8890', network: 'mtn', now: () => at } });
    expect(screen.getByText('Check', { exact: false }).textContent).toContain('MTN MoMo prompt');
    expect(screen.getByRole('timer').textContent).toBe('2:00');
    const resend = screen.getByRole('button', { name: /Resend prompt/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    expect(resend.textContent?.trim()).toBe('Resend prompt in 30s');
    await fireEvent.click(screen.getByRole('button', { name: 'I’ve approved' }));
    expect(c.check).toHaveBeenCalled();
  });
});
