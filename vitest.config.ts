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
    // Re-process the packed fixture through Vite so its Svelte imports use
    // the same browser module graph as Testing Library's mount function.
    server: {
      deps: {
        inline: [/\.reevit-checkout-package-/],
      },
    },
  },
});
