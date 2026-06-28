import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        'pitch-processor': 'src/fx/effects/worklets/pitch-processor.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'pitch-processor'
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
