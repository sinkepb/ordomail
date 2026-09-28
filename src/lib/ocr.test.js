// Tests unitaires — extraction OCR (parsers regex uniquement).
// @fix 24/09/2026 (audit) — pipeline OCR complet (290 lignes) sans aucun test
// malgré son rôle central et un historique de bugs regex réels corrigés en
// production (voir les commentaires @fix dans ocr.js). Les fonctions qui
// dépendent du DOM/canvas (preprocessImage, pdfToImage...) ou de Tesseract/
// pdf.js restent hors périmètre ici (environnement de test Node, sans DOM) —
// seule la logique pure et la plus régulièrement fautive par le passé,
// OCR_PARSERS, est couverte.
import { describe, it, expect } from 'vitest';
import { OCR_PARSERS } from './ocr.js';

describe('OCR_PARSERS.nom', () => {
  it('extrait le nom après "Patient :"', () => {
    expect(OCR_PARSERS.nom('Patient : Jean DUPONT\nNé le 01/01/1980')).toBe('Jean DUPONT');
  });

  it('extrait le nom après "Nom de naissance :" (variante Doctolib)', () => {
    expect(OCR_PARSERS.nom('Nom de naissance : Rosy NGAMENI TCHOKOTEU\nNé(e) le 12/03/1990')).toBe('Rosy NGAMENI TCHOKOTEU');
  });

  it('extrait le nom en formule d\'adresse sans label ("Madame ...")', () => {
    expect(OCR_PARSERS.nom('Madame Gloria NGO\n12 rue des Lilas')).toBe('Gloria NGO');
  });

  it('ne capture pas au-delà de la ligne (saut de ligne non avalé)', () => {
    // @fix 16/09/2026 — reproduit le bug historique : le motif générique ne
    // doit jamais fusionner deux lignes distinctes.
    const txt = 'GYNECOLOGUE OBSTETRICIEN ET\nMEDICAL\nAncien Interne et Chef de clinique';
    expect(OCR_PARSERS.nom(txt)).toBeNull();
  });

  it('rejette un faux positif composite type bloc de titres médecin', () => {
    // @fix 16/09/2026 — "MEDICAL Ancien Interne" capturé comme nom patient sur
    // une vraie ordonnance Doctolib (bloc de titres en en-tête).
    expect(OCR_PARSERS.nom('MEDICAL Ancien Interne')).toBeNull();
  });

  it('retourne null si aucun motif ne correspond', () => {
    expect(OCR_PARSERS.nom('texte sans structure reconnaissable')).toBeNull();
  });

  it('tronque à 50 caractères', () => {
    const longNom = 'A'.repeat(60);
    expect(OCR_PARSERS.nom(`Patient : ${longNom}`).length).toBeLessThanOrEqual(50);
  });
});

describe('OCR_PARSERS.medecin', () => {
  it('extrait "Dr <nom>" sur une seule ligne malgré une spécialité juste en dessous', () => {
    // @fix 18/09/2026 — bug historique : "Dr Panagiota BOUGATSOU\nOphtalmologiste"
    // capturait "Panagiota BOUGATSOU\nOphtalmolog" (saut de ligne avalé par \s).
    const txt = 'Dr Panagiota BOUGATSOU\nOphtalmologiste';
    expect(OCR_PARSERS.medecin(txt)).toBe('Dr Panagiota BOUGATSOU');
  });

  it('reconnaît "Docteur" en toutes lettres', () => {
    expect(OCR_PARSERS.medecin('Docteur Martin Dupuis\nCardiologue')).toBe('Dr Martin Dupuis');
  });

  it('retombe sur "Prescripteur :" si "Dr"/"Docteur" absent', () => {
    expect(OCR_PARSERS.medecin('Prescripteur : Sophie Lambert')).toBe('Dr Sophie Lambert');
  });

  it('retourne null si aucun motif ne correspond', () => {
    expect(OCR_PARSERS.medecin('texte sans médecin mentionné')).toBeNull();
  });

  it('tronque le nom à 40 caractères', () => {
    const longNom = 'A'.repeat(60);
    expect(OCR_PARSERS.medecin(`Dr ${longNom}`).length).toBeLessThanOrEqual(43); // "Dr " + 40
  });
});

describe('OCR_PARSERS.carteVitale', () => {
  it('formate un numéro de 15 chiffres en groupes', () => {
    expect(OCR_PARSERS.carteVitale('1850578006048 12')).toBe('1 85 05 78 006 048 12');
  });

  it('retourne null si aucune séquence plausible n\'est trouvée', () => {
    expect(OCR_PARSERS.carteVitale('pas de numéro ici')).toBeNull();
  });
});

describe('OCR_PARSERS.date', () => {
  it('parse une date au format JJ/MM/AAAA', () => {
    expect(OCR_PARSERS.date('Le 5/6/2026 à Paris')).toBe('05/06/2026');
  });

  it('étend une année à 2 chiffres en 20XX', () => {
    expect(OCR_PARSERS.date('01-02-26')).toBe('01/02/2026');
  });

  it('accepte le point ou le point médian comme séparateur', () => {
    expect(OCR_PARSERS.date('01.02.2026')).toBe('01/02/2026');
  });

  it('retourne null si aucune date n\'est trouvée', () => {
    expect(OCR_PARSERS.date('aucune date ici')).toBeNull();
  });
});

describe('OCR_PARSERS.medicaments', () => {
  it('détecte une ligne avec dosage', () => {
    expect(OCR_PARSERS.medicaments('Doliprane 1000 mg\nÀ prendre matin et soir')).toContain('Doliprane 1000 mg');
  });

  it('détecte une ligne avec forme galénique sans dosage explicite', () => {
    expect(OCR_PARSERS.medicaments('Amoxicilline gel\nCourte durée')).toContain('Amoxicilline gel');
  });

  it('ignore les lignes trop courtes ou sans motif reconnu', () => {
    expect(OCR_PARSERS.medicaments('ok\nune ligne quelconque sans rapport avec un médicament')).toHaveLength(0);
  });

  it('limite à 10 médicaments et déduplique', () => {
    const lignes = Array.from({ length: 15 }, () => 'Doliprane 500 mg').join('\n');
    expect(OCR_PARSERS.medicaments(lignes)).toHaveLength(1);
  });
});
