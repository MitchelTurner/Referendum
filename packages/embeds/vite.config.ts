import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/referendum.ts',
      formats: ['es'],
      fileName: () => 'referendum.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
