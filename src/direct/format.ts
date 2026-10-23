import { currencyExponent } from '@reevit/core';

export const NETWORK_LABEL: Record<string, string> = {
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  airteltigo: 'AirtelTigo Money',
  mpesa: 'M-Pesa',
};

/** 0244128890 -> "024 412 8890"; 254712345678 -> "+254 712 345 678". Anything else as given. */
export function formatPayerPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  if (digits.startsWith('233') && digits.length === 12) return formatPayerPhone(`0${digits.slice(3)}`);
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return phone;
}

export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Seconds left and the share of the window still ahead. */
export function countdown(
  expiresAt: number | null,
  startedAt: number | null,
  at: number,
): { seconds: number; fraction: number } {
  if (!expiresAt) return { seconds: 0, fraction: 0 };
  const remaining = Math.max(0, expiresAt - at);
  const total = Math.max(1, expiresAt - (startedAt ?? expiresAt - 120_000));
  return { seconds: Math.ceil(remaining / 1000), fraction: Math.min(1, remaining / total) };
}

/** 7820194552 -> "7820 194 552". Account numbers of any other length are shown as given. */
export function formatAccountNumber(value: string): string {
  const digits = value.replace(/\s/g, '');
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : value;
}

/** 75500 + GHS -> "755.00": the figure a banking app expects pasted into its amount field. */
export function plainAmount(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return (minor / 10 ** exponent).toFixed(exponent);
}

/** Copy to the clipboard, falling back to a hidden textarea where the async API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** What the Copy button says where the clipboard is blocked. */
export const pasteHint = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Press ⌘C' : 'Press Ctrl+C';
