import { describe, it, expect } from "vitest";
import { escapeHtml } from "./utils.js";

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
