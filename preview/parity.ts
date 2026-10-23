/**
 * Parity harness: renders the real <ReevitCheckout> in one fixed state per URL, with
 * mock intents and NO network calls.
 *
 *   /parity.html?state=list&theme=light&provider=paystack
 *
 * state:    list | opening | stripe | mpesa-phone | mpesa-waiting | mpesa-failed |
 *           loading | processing | failure | receipt | confirm
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
