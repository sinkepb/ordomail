import { describe, it, expect } from 'vitest';
import { origineAutorisee, parseAllowlist } from './corsOrigin.ts';

describe('origineAutorisee', () => {
  const liste = ['https://ordomail.fr', 'https://ordomail-git-develop-team.vercel.app'];

  it('accepte une origine explicitement listée', () => {
    expect(origineAutorisee('https://ordomail.fr', liste)).toBe(true);
  });

  it('refuse un autre projet Vercel nommé ordomail-*', () => {
    expect(origineAutorisee('https://ordomail-attaquant.vercel.app', liste)).toBe(false);
  });

  it('refuse une origine vide', () => {
    expect(origineAutorisee('', liste)).toBe(false);
  });
});

describe('parseAllowlist', () => {
  it('lit une liste séparée par des virgules, en ignorant les espaces et vides', () => {
    expect(parseAllowlist('https://a.fr, https://b.fr,,')).toEqual(['https://a.fr', 'https://b.fr']);
  });

  it('renvoie une liste vide si la variable est absente', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
  });
});
