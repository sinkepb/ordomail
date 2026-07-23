import { describe, it, expect } from "vitest";
import { escapeHtml, toDateKey } from "./utils.js";

// escapeHtml est le correctif de la faille XSS stockée de la phase 1 (nom
// patient injecté dans l'impression/PDF) — tests ciblés en priorité dessus.
describe("escapeHtml", () => {
  it("échappe les caractères HTML dangereux", () => {
    expect(escapeHtml("<img src=x onerror=alert(1)>"))
      .toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("échappe & avant les autres entités (pas de double échappement partiel)", () => {
    expect(escapeHtml("Tom & Jerry <script>")).toBe("Tom &amp; Jerry &lt;script&gt;");
  });

  it("échappe guillemets et apostrophes (contexte attribut HTML)", () => {
    expect(escapeHtml(`"onmouseover="alert(1)`)).toBe("&quot;onmouseover=&quot;alert(1)");
    expect(escapeHtml("O'Brien")).toBe("O&#39;Brien");
  });

  it("laisse le texte normal inchangé", () => {
    expect(escapeHtml("MARTIN Pierre")).toBe("MARTIN Pierre");
  });

  it("gère null/undefined sans lever d'exception", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("convertit les valeurs non-string (nombres) avant échappement", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});

// Bug signalé le 24/07/2026 : le calendrier du dashboard affichait "23" comme
// date du jour un vendredi 24. Cause : toDateKey() utilisait toISOString(),
// qui convertit en UTC avant de formater — dans un fuseau en avance sur UTC,
// les premières heures de la journée locale sont encore la veille en UTC.
describe("toDateKey", () => {
  it("utilise la date locale, pas UTC, même juste après minuit local", () => {
    const d = new Date(2026, 6, 24, 0, 30); // 24 juillet 2026, 00:30 heure locale
    expect(toDateKey(d)).toBe("2026-07-24");
  });

  it("correspond toujours aux composants de date locaux, quel que soit le fuseau d'exécution", () => {
    const d = new Date(2026, 0, 5, 23, 45); // 5 janvier 2026, 23:45 heure locale
    expect(toDateKey(d)).toBe(`${d.getFullYear()}-01-05`);
  });

  it("accepte une chaîne ISO ou un timestamp en plus d'un objet Date", () => {
    const d = new Date(2026, 11, 31, 12, 0);
    expect(toDateKey(d.toISOString())).toBe(toDateKey(d));
  });
});
