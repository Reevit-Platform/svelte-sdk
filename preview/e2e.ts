/**
 * Live checkout against a real backend, no stubs:
 *
 *   /e2e.html?api=http://localhost:8081&session=cs_...
 *
 * Create the session on the server (POST /v1/checkout/sessions with an API key)
 * and pass its `session_secret`. With the backend's `stub` provider, the number's
 * last digits pick the outcome (see adapters/psp/stub). Events are written to
 * `window.__events` so a script can assert on them.
 */
import { mount } from 'svelte';
import '../src/styles.css';
import E2E from './E2E.svelte';

mount(E2E, { target: document.getElementById('root')! });
