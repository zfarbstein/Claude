// Builds the in-Claude demo: the real app with Supabase swapped for an in-browser stand-in
// (src/demo). Used by scripts/build-demo.mjs. Never deployed.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify('1'),
    'import.meta.env.VITE_APP_NAME': JSON.stringify(process.env.VITE_APP_NAME || 'Chapter Calendar'),
  },
  resolve: {
    alias: [
      { find: /^(\.\.?\/)+lib\/supabase$/, replacement: src('demo/supabase.ts') },
      { find: 'virtual:pwa-register/react', replacement: src('demo/pwaStub.ts') },
    ],
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rolldownOptions: { output: { codeSplitting: false } },
  },
})
