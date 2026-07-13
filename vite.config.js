import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      output: { manualChunks: undefined },
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'qrcode', '@supabase/supabase-js'],
    exclude: ['tesseract.js', 'pdfjs-dist']
  }
})
