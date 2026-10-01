// Tests unitaires — calcul des statistiques d'efficacité des rappels.
// @fix 01/10/2026 (audit DevOps) — logique auparavant inline dans
// secure-data/index.ts (closure Deno.serve unique, non testable), extraite
// pour pouvoir vérifier précisément le cas qui motive cette extraction : le
// dénominateur multi-canal (SMS + appel).
import { describe, it, expect } from 'vitest';
import { computeRappelsStats } from './rappelsStatsLogic.ts';

describe('computeRappelsStats', () => {
  it('aucun rappel : tout à zéro, pas de division par zéro', () => {
    const result = computeRappelsStats([], []);
    expect(result).toEqual({
      rappelsActifs: 0,
      rappelsTotal: 0,
      smsEnvoyes90j: 0,
      echecs90j: 0,
      tauxReponse: 0,
      tauxRenouvellement: 0,
      delaiReponseMoyenHeures: null,
      choixCounts: { tout_renouveler: 0, rien: 0, partiel: 0, stop: 0 },
    });
  });

  it('taux de réponse SMS simple : 2 envoyés, 1 répondu', () => {
    const rappels = [{ id: 'r1', statut: 'a_traiter' }, { id: 'r2', statut: 'sms_envoye' }];
    const evenements = [
      { rappel_id: 'r1', type: 'sms_envoye', created_at: '2026-09-01T10:00:00Z' },
      { rappel_id: 'r1', type: 'reponse_patient', meta: { choix: 'tout_renouveler' }, created_at: '2026-09-01T12:00:00Z' },
      { rappel_id: 'r2', type: 'sms_envoye', created_at: '2026-09-01T10:00:00Z' },
    ];
    const result = computeRappelsStats(rappels, evenements);
    expect(result.tauxReponse).toBe(50); // 1 réponse / 2 contactés
    expect(result.smsEnvoyes90j).toBe(2);
    expect(result.choixCounts.tout_renouveler).toBe(1);
    expect(result.delaiReponseMoyenHeures).toBe(2);
  });

  // Le cas qui motive cette extraction (01/10/2026, audit) : un patient en
  // mode "appel" n'a JAMAIS d'évènement sms_envoye, sa réponse ne doit pas
  // gonfler le taux au-delà de ce que le dénominateur multi-canal permet.
  it('un patient en mode "appel" compte au dénominateur sans jamais envoyer de SMS', () => {
    const rappels = [{ id: 'r1', statut: 'a_traiter' }];
    const evenements = [
      { rappel_id: 'r1', type: 'a_appeler', created_at: '2026-09-01T09:00:00Z' },
      { rappel_id: 'r1', type: 'reponse_patient', meta: { choix: 'tout_renouveler', canal: 'appel' }, created_at: '2026-09-01T09:30:00Z' },
    ];
    const result = computeRappelsStats(rappels, evenements);
    expect(result.smsEnvoyes90j).toBe(0);
    expect(result.tauxReponse).toBe(100); // 1 réponse / 1 contacté (par appel), jamais >100%
  });

  it('mélange SMS + appel : le taux ne dépasse jamais 100% même avec plus de réponses que de SMS', () => {
    const rappels = [{ id: 'r1', statut: 'a_traiter' }, { id: 'r2', statut: 'a_traiter' }];
    const evenements = [
      // r1 : un seul SMS envoyé, pas de réponse
      { rappel_id: 'r1', type: 'sms_envoye', created_at: '2026-09-01T10:00:00Z' },
      // r2 : mode appel, répond quand même — AVANT le correctif, ce
      // numérateur se serait ajouté sans jamais de SMS au dénominateur.
      { rappel_id: 'r2', type: 'a_appeler', created_at: '2026-09-01T09:00:00Z' },
      { rappel_id: 'r2', type: 'reponse_patient', meta: { choix: 'rien' }, created_at: '2026-09-01T09:30:00Z' },
    ];
    const result = computeRappelsStats(rappels, evenements);
    expect(result.tauxReponse).toBe(50); // 1 réponse / 2 contactés (r1 + r2), jamais 100% ou plus
  });

  it('une relance compte dans smsEnvoyes90j (SMS réel facturé)', () => {
    const rappels = [{ id: 'r1', statut: 'sms_envoye' }];
    const evenements = [
      { rappel_id: 'r1', type: 'sms_envoye', created_at: '2026-09-01T10:00:00Z' },
      { rappel_id: 'r1', type: 'relance_envoyee', created_at: '2026-09-04T10:00:00Z' },
    ];
    const result = computeRappelsStats(rappels, evenements);
    expect(result.smsEnvoyes90j).toBe(2);
  });

  it('rappelsActifs inclut "a_appeler" et "prepare", exclut "termine"', () => {
    const rappels = [
      { id: 'r1', statut: 'en_attente' },
      { id: 'r2', statut: 'a_appeler' },
      { id: 'r3', statut: 'prepare' },
      { id: 'r4', statut: 'termine' },
    ];
    const result = computeRappelsStats(rappels, []);
    expect(result.rappelsActifs).toBe(3);
    expect(result.rappelsTotal).toBe(4);
  });

  it('un choix "stop" (opposition) est compté séparément, ne gonfle pas tauxRenouvellement', () => {
    const rappels = [{ id: 'r1', statut: 'termine' }];
    const evenements = [
      { rappel_id: 'r1', type: 'sms_envoye', created_at: '2026-09-01T10:00:00Z' },
      { rappel_id: 'r1', type: 'reponse_patient', meta: { choix: 'stop' }, created_at: '2026-09-01T11:00:00Z' },
    ];
    const result = computeRappelsStats(rappels, evenements);
    expect(result.choixCounts.stop).toBe(1);
    expect(result.tauxRenouvellement).toBe(0); // "stop" n'est ni tout_renouveler ni partiel
  });
});
