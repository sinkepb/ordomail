import { defineConfig } from "vitest/config";

// Tests ciblés (phase 2) : logique pure critique introduite/corrigée en phase 1
// (échappement XSS, jetons vendeur/admin). Pas encore de tests de composants
// React ni d'edge functions Deno dans leur ensemble — voir DEPLOIEMENT_PHASE2.md
// pour ce qui reste hors périmètre de cette passe.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx,ts,tsx}", "supabase/functions/**/*.test.{js,ts}"],
  },
});
