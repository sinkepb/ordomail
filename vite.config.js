import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Désactivées en production : les sourcemaps exposaient le code source lisible
    // (React non minifié, logique métier) à quiconque ouvre les devtools sur le
    // site public — aucun usage Sentry configuré aujourd'hui qui en dépendrait.
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      // Chunking par défaut de Rollup réactivé (vendor séparé de l'app) — le
      // undefined explicite forçait tout dans un seul gros bundle.
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'qrcode', '@supabase/supabase-js'],
    exclude: ['tesseract.js', 'pdfjs-dist']
  }
})
