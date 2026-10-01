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
  // .claude/worktrees/** (01/10/2026, audit DevOps) — des sessions d'agents
  // isolées (Agent tool, isolation:"worktree") laissent des copies complètes
  // du dépôt sous .claude/worktrees/<agent>/, jamais exclues jusqu'ici : `eslint .`
  // depuis la racine les relintait toutes, y compris leur propre copie de
  // public/tesseract-core (le pattern ci-dessous ne matchait qu'à la racine),
  // remontant des centaines de faux positifs qui masquaient le vrai résultat.
  { ignores: ["dist/**", "node_modules/**", "supabase/functions/**", "files/**", "public/tesseract-core/**", "public/tesseract-worker.min.js", ".claude/**", "**/public/tesseract-core/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // __BUILD_TIME__ : injecté par esbuild/Vite au build (voir vite.config.js
      // `define`), jamais déclaré dans le code source — no-undef le signalerait
      // sinon comme un identifiant oublié.
      globals: { ...globals.browser, ...globals.es2021, __BUILD_TIME__: "readonly" },
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
  {
    // Tests Vitest/Playwright + config Playwright, exécutés sous Node (pas
    // dans le navigateur) — process.env, __dirname, etc. y sont légitimes,
    // contrairement au reste du code applicatif.
    files: ["**/*.test.{js,jsx}", "e2e/**/*.js", "playwright.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
