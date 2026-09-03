import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    server: {
      // @hubteljs/checkout ships extensionless ESM imports that Node cannot resolve;
      // inlining routes it through Vite's resolver instead.
      deps: { inline: ['@hubteljs/checkout'] },
    },
  },
});
