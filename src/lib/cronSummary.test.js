import { describe, it, expect } from 'vitest';
import { resumerJob } from './cronSummary.js';

const maintenant = Date.parse('2026-10-05T12:00:00Z');
const il = (h) => new Date(maintenant - h * 3600 * 1000).toISOString();

describe('resumerJob', () => {
  it('job inactif', () => {
    expect(resumerJob({ active: false, runs: [] }, maintenant).statut).toBe('inactif');
  });
  it('job jamais exécuté', () => {
    expect(resumerJob({ active: true, runs: [] }, maintenant).statut).toBe('jamais');
  });
  it('dernière exécution réussie', () => {
    const r = resumerJob({ active: true, runs: [{ status: 'succeeded', start_time: il(1) }] }, maintenant);
    expect(r.statut).toBe('ok');
    expect(r.echecs24h).toBe(0);
  });
  it('dernière exécution en échec, avec le message', () => {
    const r = resumerJob({ active: true, runs: [{ status: 'failed', start_time: il(1), message: 'timeout' }] }, maintenant);
    expect(r.statut).toBe('erreur');
    expect(r.derniereErreur).toBe('timeout');
    expect(r.echecs24h).toBe(1);
  });
  it('compte seulement les échecs des 24 dernières heures', () => {
    const runs = [
      { status: 'succeeded', start_time: il(1) },
      { status: 'failed', start_time: il(2) },
      { status: 'failed', start_time: il(30) },
    ];
    expect(resumerJob({ active: true, runs }, maintenant).echecs24h).toBe(1);
  });
});
