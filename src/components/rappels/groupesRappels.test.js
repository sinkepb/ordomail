import { describe, it, expect } from "vitest";
import { calculerGroupesAffichage } from "./groupesRappels.js";

const base = { pharmacie_id: "ph1", patient_prenom: "Jean", patient_nom: "Dupont", statut: "en_attente", mode_contact: "sms" };

describe("calculerGroupesAffichage", () => {
  it("regroupe les rappels en attente même numéro (format différent) et même jour", () => {
    const rappels = [
      { ...base, id: "a", patient_telephone: "06 12 34 56 78", date_prochaine_relance: "2026-10-24T00:00:00Z" },
      { ...base, id: "b", patient_telephone: "+33612345678", date_prochaine_relance: "2026-10-24T00:00:00Z" },
    ];
    const g = calculerGroupesAffichage(rappels);
    expect(g.get("a").taille).toBe(2);
    expect(g.get("b").couleur).toBe(g.get("a").couleur);
  });

  it("ne regroupe pas des dates différentes", () => {
    const rappels = [
      { ...base, id: "a", patient_telephone: "0612345678", date_prochaine_relance: "2026-10-04T00:00:00Z" },
      { ...base, id: "b", patient_telephone: "0612345678", date_prochaine_relance: "2026-11-01T00:00:00Z" },
    ];
    expect(calculerGroupesAffichage(rappels).size).toBe(0);
  });

  it("ignore les numéros fixes et les autres pharmacies", () => {
    const rappels = [
      { ...base, id: "a", mode_contact: "appel", patient_telephone: "0112345678", date_prochaine_relance: "2026-10-04T00:00:00Z" },
      { ...base, id: "b", mode_contact: "appel", patient_telephone: "0112345678", date_prochaine_relance: "2026-10-04T00:00:00Z" },
      { ...base, id: "c", pharmacie_id: "ph2", patient_telephone: "0612345678", date_prochaine_relance: "2026-10-04T00:00:00Z" },
      { ...base, id: "d", patient_telephone: "0612345678", date_prochaine_relance: "2026-10-04T00:00:00Z" },
    ];
    expect(calculerGroupesAffichage(rappels).size).toBe(0);
  });

  it("utilise groupe_id pour les rappels déjà envoyés", () => {
    const rappels = [
      { ...base, id: "a", statut: "sms_envoye", groupe_id: "G1", patient_telephone: "0612345678" },
      { ...base, id: "b", statut: "sms_envoye", groupe_id: "G1", patient_telephone: "0612345678" },
    ];
    expect(calculerGroupesAffichage(rappels).get("b").taille).toBe(2);
  });
});
