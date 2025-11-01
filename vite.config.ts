import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const config = {
    plugins: [react()],
    base: '/',
  };

  if (command !== 'serve') {
    // In a real-world scenario, you might pull this from an environment variable
    // For this project, we can hardcode it based on a typical GitHub Pages URL structure
    // assuming the repo name is 'zenith-notebook'.
    // You would change 'zenith-notebook' to your actual repository name.
    config.base = '/Zenith-Notebook/';
  }

  return config;
});
