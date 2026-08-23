import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The GitHub Pages deployment lives at /Zenith-Notebook/, but every asset
// reference in index.html and the manifest is relative, so a relative base
// also works if the app is served from a different path.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/Zenith-Notebook/',
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
}));
