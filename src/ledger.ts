/**
 * Shared pieces of the Ledger checkout: method labels, brand marks, money formatting.
 */

import { currencyExponent } from '@reevit/core';
import type { PaymentMethod } from '@reevit/core';

import airteltigoLogo from './assets/methods/airteltigo.png';
import applePayLogo from './assets/methods/apple-pay.png';
import googlePayLogo from './assets/methods/google-pay.png';
import mastercardLogo from './assets/methods/mastercard.png';
import mpesaLogo from './assets/methods/mpesa.png';
import mtnLogo from './assets/methods/mtn.png';
import telecelLogo from './assets/methods/telecel.png';
import visaLogo from './assets/methods/visa.png';

import flutterwaveLogo from './assets/providers/flutterwave.png';
import hubtelLogo from './assets/providers/hubtel.png';
import monnifyLogo from './assets/providers/monnify.png';
import mpesaWordmark from './assets/providers/mpesa-wordmark.png';
import paystackLogo from './assets/providers/paystack.png';
import stripeLogo from './assets/providers/stripe.png';

/** Order the method list is shown in. */
export const METHOD_ORDER: PaymentMethod[] = ['card', 'mobile_money', 'bank_transfer', 'apple_pay', 'google_pay'];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'Card',
  mobile_money: 'Mobile money',
  bank_transfer: 'Bank transfer',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export interface FooterProvider {
  id: string;
  name: string;
  src: string;
  kind: 'icon' | 'word';
}

/** Footer mark per provider. Wordmarks sit a touch shorter than icons so they read at the same weight. */
export const PROVIDER_FOOTER: Record<string, { src: string; kind: 'icon' | 'word' }> = {
  paystack: { src: paystackLogo, kind: 'icon' },
  hubtel: { src: hubtelLogo, kind: 'icon' },
  flutterwave: { src: flutterwaveLogo, kind: 'icon' },
  monnify: { src: monnifyLogo, kind: 'word' },
  mpesa: { src: mpesaWordmark, kind: 'word' },
  stripe: { src: stripeLogo, kind: 'word' },
};

export const titleCase = (value: string): string => value.replace(/^\w/, (c) => c.toUpperCase());

/**
 * Amount as shown in the checkout header and on buttons: `GHS 755.00`.
 * Minor units in, ISO code + grouped number out, using the currency's real exponent.
 */
export function formatMoney(minor: number, currency: string): string {
  const code = (currency || 'GHS').toUpperCase();
  const exp = currencyExponent(code);
  const value = (minor || 0) / 10 ** exp;
  return `${code} ${value.toLocaleString('en-GB', { minimumFractionDigits: exp, maximumFractionDigits: exp })}`;
}

export interface MethodMark {
  /** Stable key, rendered as `data-mark` so CSS can target a brand without matching URLs. */
  key: string;
  src: string;
}

/** Brand marks shown on a method row, keyed for styling. */
export function getMethodMarks(country: string, method: string): MethodMark[] {
  const c = country.toUpperCase();
  const mark = (key: string, src: string): MethodMark => ({ key, src });

  if (method === 'card') return [mark('visa', visaLogo), mark('mastercard', mastercardLogo)];
  if (method === 'apple_pay') return [mark('apple_pay', applePayLogo)];
  if (method === 'google_pay') return [mark('google_pay', googlePayLogo)];
  if (method === 'mobile_money') {
    if (c === 'GH') return [mark('mtn', mtnLogo), mark('telecel', telecelLogo), mark('airteltigo', airteltigoLogo)];
    if (c === 'KE') return [mark('mpesa', mpesaLogo)];
    return [mark('mtn', mtnLogo)];
  }
  return [];
}

/** Currency to the country whose marks (mobile money networks) the method list shows. */
export function getCountryFromCurrency(currency: string): string {
  const currencyToCountry: Record<string, string> = {
    GHS: 'GH',
    NGN: 'NG',
    KES: 'KE',
    ZAR: 'ZA',
    USD: 'US',
    GBP: 'GB',
    EUR: 'EU',
  };
  return currencyToCountry[currency.toUpperCase()] || 'GH';
}
