import { defineConfig } from '@playwright/test';

// E2E minimal (27/07/2026) — tourne exclusivement contre le mode démo
// (VITE_DEMO_MODE=true forcé ci-dessous, prioritaire sur .env.local qui peut
// pointer vers un vrai projet Supabase en local). Voir e2e/README.md pour le
// pourquoi de ce choix — notamment pourquoi le paiement Stripe n'est PAS
// automatisé jusqu'au bout.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_MODE: 'true' },
    timeout: 30_000,
  },
});
