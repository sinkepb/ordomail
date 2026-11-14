import { describe, it, expect } from 'vitest';
import { validerContact, estRobot, construireEmail, emailValide } from './contactLogic.ts';
import { escapeHtml } from './html.ts';

const base = { nom: 'Claire Martin', email: 'Claire@Exemple.fr', telephone: '06 12 34 56 78', pharmacie: 'Pharmacie du Centre', sujet: 'demo', message: 'Bonjour, je voudrais une démonstration.' };

describe('validerContact', () => {
  it('accepte une saisie complète et normalise l\'email', () => {
    const r = validerContact(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe('claire@exemple.fr');
  });
  it('refuse un nom vide, un email invalide, un message trop court', () => {
    expect(validerContact({ ...base, nom: '  ' }).ok).toBe(false);
    expect(validerContact({ ...base, email: 'pas-un-email' }).ok).toBe(false);
    expect(validerContact({ ...base, message: 'court' }).ok).toBe(false);
  });
  it('téléphone et pharmacie sont facultatifs', () => {
    expect(validerContact({ ...base, telephone: '', pharmacie: '' }).ok).toBe(true);
  });
  it('supprime les retours à la ligne des champs mono-ligne (injection d\'en-têtes)', () => {
    const r = validerContact({ ...base, nom: 'Eve\r\nBcc: x@y.z' });
    expect(r.ok && r.data.nom).toBe('Eve Bcc: x@y.z');
  });
  it('remplace un sujet inconnu par « autre »', () => {
    const r = validerContact({ ...base, sujet: 'hack' });
    expect(r.ok && r.data.sujet).toBe('autre');
  });
  it('tronque un message trop long', () => {
    const r = validerContact({ ...base, message: 'a'.repeat(9000) });
    expect(r.ok && r.data.message.length).toBe(5000);
  });
});

describe('emailValide', () => {
  it('refuse les adresses avec chevrons ou virgules', () => {
    expect(emailValide('a@b.fr')).toBe(true);
    expect(emailValide('a@b.fr,c@d.fr')).toBe(false);
    expect(emailValide('<a@b.fr>')).toBe(false);
  });
});

describe('estRobot', () => {
  it('détecte le champ piège rempli', () => {
    expect(estRobot({ site: 'http://spam' })).toBe(true);
  });
  it('détecte un envoi trop rapide', () => {
    expect(estRobot({ ouvertA: 1000 }, 2000)).toBe(true);
    expect(estRobot({ ouvertA: 1000 }, 9000)).toBe(false);
  });
  it('laisse passer un humain', () => {
    expect(estRobot({ site: '' })).toBe(false);
  });
});

describe('construireEmail', () => {
  it('échappe le HTML saisi par le visiteur', () => {
    const r = validerContact({ ...base, message: '<script>alert(1)</script> bonjour à tous' });
    if (!r.ok) throw new Error('validation');
    const e = construireEmail(r.data, escapeHtml);
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(e.sujet).toContain('Demande de démonstration');
    expect(e.text).toContain('Pharmacie du Centre');
  });
});
