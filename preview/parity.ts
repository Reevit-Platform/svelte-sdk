/**
 * Parity harness: renders the real <ReevitCheckout> in one fixed state per URL, with
 * mock intents and NO network calls.
 *
 *   /parity.html?state=list&theme=light&provider=paystack
 *
 * state:    list | opening | stripe | mpesa-phone | mpesa-waiting | mpesa-failed |
 *           loading | processing | failure | receipt | confirm |
 *           Reevit's own mobile money screens (a session with `flow: direct`, frozen clock):
 *           momo-form | momo-wait | momo-declined | momo-insufficient | momo-timeout |
 *           momo-otp | momo-voucher | momo-failover | momo-failover-success | momo-mpesa-wait
 *           Reevit's own bank transfer screens (same session, frozen clock):
 *           bank-details | bank-no-name | bank-confirming | bank-not-seen | bank-expired
 *           (&expires=20 sets the seconds left on the details screen; the prototype shots read 0:17 and 0:20)
 * theme:    light | dark
 * pointer:  1 = start closed and open from a real click on the merchant's Pay button
 *           (what screenshots use, so focus rings behave as for a mouse user)
 * provider: paystack | hubtel | flutterwave | monnify | stripe | mpesa
 */
import './stubs';
import { mount } from 'svelte';
import '../src/styles.css';
import Parity from './Parity.svelte';

mount(Parity, { target: document.getElementById('root')! });
