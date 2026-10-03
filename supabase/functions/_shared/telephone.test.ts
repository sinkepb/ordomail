import { describe, it, expect } from 'vitest';
import { estNumeroFixe, normaliserTelephone } from './telephone.ts';

describe('estNumeroFixe', () => {
  it('reconnaît les mobiles (06/07) comme non-fixes', () => {
    expect(estNumeroFixe('0612345678')).toBe(false);
    expect(estNumeroFixe('0712345678')).toBe(false);
    expect(estNumeroFixe('+33612345678')).toBe(false);
  });

  it('reconnaît les fixes par indicatif régional (01-05)', () => {
    expect(estNumeroFixe('0142345678')).toBe(true); // Paris
    expect(estNumeroFixe('0242345678')).toBe(true); // Nord-Ouest
    expect(estNumeroFixe('0342345678')).toBe(true); // Nord-Est
    expect(estNumeroFixe('0442345678')).toBe(true); // Sud-Est
    expect(estNumeroFixe('0542345678')).toBe(true); // Sud-Ouest
  });

  it('reconnaît les fixes non géographiques (09, box internet)', () => {
    expect(estNumeroFixe('0912345678')).toBe(true);
  });

  it('tolère les espaces/points/tirets et le format +33', () => {
    expect(estNumeroFixe('01 42 34 56 78')).toBe(true);
    expect(estNumeroFixe('06.12.34.56.78')).toBe(false);
    expect(estNumeroFixe('+33142345678')).toBe(true);
  });

  it('numéro vide ou invalide : traité comme non-fixe par défaut (repli sur le SMS)', () => {
    expect(estNumeroFixe('')).toBe(false);
  });
});

// @fix 03/10/2026 — regroupement des rappels par patient (voir
// rappelLogic.ts:regrouperParTelephone) : deux écritures du même numéro
// doivent produire la même clé.
describe('normaliserTelephone', () => {
  it('ramène le format +33 à la forme 0X', () => {
    expect(normaliserTelephone('+33612345678')).toBe('0612345678');
  });

  it('retire espaces/points/tirets', () => {
    expect(normaliserTelephone('06 12 34 56 78')).toBe('0612345678');
    expect(normaliserTelephone('06.12.34.56.78')).toBe('0612345678');
    expect(normaliserTelephone('06-12-34-56-78')).toBe('0612345678');
  });

  it('les deux écritures du même numéro produisent la même clé', () => {
    expect(normaliserTelephone('+33 6 12 34 56 78')).toBe(normaliserTelephone('06.12.34.56.78'));
  });
});
