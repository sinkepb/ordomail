import { describe, it, expect } from 'vitest';
import { dimensionsTiffAcceptables } from './tiffLimits.ts';

describe('dimensionsTiffAcceptables', () => {
  it('accepte une page de scanner courante (A4 300 dpi)', () => {
    expect(dimensionsTiffAcceptables(2480, 3508)).toBe(true);
  });

  it('refuse une dimension annoncée démesurée (en-tête piégé)', () => {
    expect(dimensionsTiffAcceptables(65535, 65535)).toBe(false);
    expect(dimensionsTiffAcceptables(20000, 100)).toBe(false);
  });

  it('refuse une surface totale au-delà du plafond même si chaque côté passe', () => {
    expect(dimensionsTiffAcceptables(9000, 9000)).toBe(false);
  });

  it('refuse les dimensions nulles, négatives ou non finies', () => {
    expect(dimensionsTiffAcceptables(0, 100)).toBe(false);
    expect(dimensionsTiffAcceptables(-1, 100)).toBe(false);
    expect(dimensionsTiffAcceptables(NaN, 100)).toBe(false);
  });
});
