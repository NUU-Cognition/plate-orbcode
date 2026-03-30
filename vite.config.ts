import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const nodeStubs = fileURLToPath(new URL('./src/lib/node-stubs.ts', import.meta.url));

export default defineConfig({
  base: '/plates/orbcode-map/',
  publicDir: 'prompts',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@nuucognition/plate-sdk': '/Users/nathan/dev/nuu/main/packages/plate-sdk/src/index.ts',
      '@nuucognition/prompt-loader': '/Users/nathan/dev/nuu/main/packages/prompt-loader/src/index.ts',
      '@nuucognition/diagram-ui': '/Users/nathan/dev/nuu/main/packages/diagram-ui/src/index.ts',
      'node:fs/promises': nodeStubs,
      'node:path': nodeStubs,
    },
  },
  build: {
    outDir: 'dist',
  },
});
