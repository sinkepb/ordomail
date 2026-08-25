// ─── Rechargement automatique sur chunk périmé après déploiement ──────────────
// Un onglet resté ouvert à travers un déploiement garde en mémoire les noms de
// fichiers hashés de l'ancien build (index.html en cache) ; le nouveau build
// les a supprimés du serveur, donc le premier import() dynamique vers une
// route pas encore visitée dans cet onglet échoue avec "Failed to fetch
// dynamically imported module" (ou l'équivalent Safari/Firefox) — ce qui
// finissait crashé tel quel dans l'ErrorBoundary plein écran, stack trace brute
// à l'appui, pour un problème qui se résout par un simple rechargement.
// Un rechargement complet récupère le index.html à jour (bons hashes) et
// résout le problème silencieusement pour l'utilisateur.
import { lazy } from "react";

const RELOAD_FLAG = "ordomail_chunk_reload";
const CHUNK_ERROR_RE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

function lazyWithReload(importFn) {
  return lazy(() =>
    importFn()
      .then((mod) => {
        // Un import réussi après un rechargement — la panne était bien
        // transitoire, on réarme le garde-fou pour un futur déploiement.
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* stockage indisponible, tant pis */ }
        return mod;
      })
      .catch((err) => {
        const isChunkError = CHUNK_ERROR_RE.test(String(err?.message || ""));
        let alreadyReloaded = true;
        try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* stockage indisponible — ne pas boucler */ }
        if (isChunkError && !alreadyReloaded) {
          try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* best effort */ }
          window.location.reload();
          // Ne jamais résoudre : la page va de toute façon être rechargée.
          return new Promise(() => {});
        }
        throw err;
      })
  );
}

export { lazyWithReload };
