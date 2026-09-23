import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html.ts';

describe('escapeHtml', () => {
  it('échappe les caractères HTML spéciaux', () => {
    expect(escapeHtml('<b>XSS</b> & "quotes" \'apos\'')).toBe(
      '&lt;b&gt;XSS&lt;/b&gt; &amp; &quot;quotes&quot; &#39;apos&#39;'
    );
  });

  it('laisse le texte sans caractère spécial inchangé', () => {
    expect(escapeHtml('Jean Dupont, Cardiologie')).toBe('Jean Dupont, Cardiologie');
  });

  it('gère une valeur non-string sans planter', () => {
    expect(escapeHtml(null as unknown as string)).toBe('null');
  });
});
