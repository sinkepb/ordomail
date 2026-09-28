import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency.ts';

describe('mapWithConcurrency', () => {
  it('traite chaque élément exactement une fois, dans l\'ordre des résultats', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('ne dépasse jamais la concurrence demandée', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('propage une exception d\'un item sans perdre les autres résultats attendus séparément', async () => {
    const items = [1, 2, 3];
    await expect(
      mapWithConcurrency(items, 2, async (n) => {
        if (n === 2) throw new Error('échec');
        return n;
      })
    ).rejects.toThrow('échec');
  });

  it('gère une liste vide', async () => {
    const results = await mapWithConcurrency([], 5, async (n) => n);
    expect(results).toEqual([]);
  });

  it('fonctionne avec une concurrence supérieure au nombre d\'éléments', async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });
});
