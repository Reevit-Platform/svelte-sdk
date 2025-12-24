import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    dts({
      insertTypesEntry: true,
      // rollupTypes: true, // Disabling because it causes "Unable to follow symbol" errors in CI
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReevitSvelte',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['svelte', '@reevit/core'],
      output: {
        globals: {
          svelte: 'Svelte',
          '@reevit/core': 'ReevitCore',
        },
      },
    },
  },
});
