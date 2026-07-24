// Config ESLint 9 (flat config). Objectif : attraper les bugs réels (variables
// non définies, hooks React mal utilisés, imports morts) sans forcer un
// reformatage global du code existant — voir DEPLOIEMENT_PHASE2.md pour le
// contexte (dette accumulée sur 15 000 lignes, pas de linter avant cette phase).
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  // public/tesseract-core, public/tesseract-worker.min.js : cœur WASM et worker
  // vendorisés depuis node_modules (self-host, voir lib/ocr.js) — code tiers généré,
  // pas du code applicatif.
  { ignores: ["dist/**", "node_modules/**", "supabase/functions/**", "files/**", "public/tesseract-core/**", "public/tesseract-worker.min.js"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",  // React 18 + Vite JSX runtime automatique
      "react/prop-types": "off",          // pas de PropTypes dans ce projet, pas le sujet de cette passe
      "react/no-unescaped-entities": "off", // texte français avec apostrophes — faux positifs massifs, pas des bugs
      "react-hooks/set-state-in-effect": "off", // règle stricte récente (v7) qui casserait des patterns existants sans bug réel derrière
      "react-hooks/purity": "off",        // règle orientée React Compiler, hors sujet de cette passe (pas de bug classique visé)
      "react-hooks/immutability": "off",  // idem — le seul cas réel qu'elle a trouvé ici (ContratEditor) a été corrigé au passage
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",                // le vrai objectif : attraper les identifiants oubliés
    },
    settings: { react: { version: "18.3" } },
  },
];
