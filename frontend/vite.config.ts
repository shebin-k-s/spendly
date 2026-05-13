import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    host: '::',
    port: 8081,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: {
        name: 'Spendly',
        short_name: 'Spendly',
        description: 'Track your monthly expenses with clarity',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        lang: 'en',
        scope: '/',
        orientation: 'portrait',
        icons: [
          { src: 'logo.png', sizes: '192x192 512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.png', sizes: '192x192 512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
