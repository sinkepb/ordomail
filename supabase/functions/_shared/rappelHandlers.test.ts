// Tests des actions rappels (supprimer, préparer, répondre) avec un faux client
// Supabase qui applique réellement les filtres et garde l'état en mémoire.
import { describe, it, expect } from 'vitest';
import { supprimerRappelAction, preparerRappelAction, repondreRappelAction } from './rappelHandlers.ts';

function makeDb(initial: Record<string, any[]>) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(initial));
  const evenements: any[] = [];
  const audits: any[] = [];
  const insertInto = (table: string, payload: any) => {
    if (table === 'rappels_evenements') evenements.push(payload);
    else if (table === 'audit_logs') audits.push(payload);
    else (tables[table] ||= []).push(payload);
    return Promise.resolve({ error: null });
  };
  const sb: any = {
    from(table: string) {
      const filtres: Array<(r: any) => boolean> = [];
      const chain: any = {
        select() { return chain; },
        eq(col: string, val: any) { filtres.push((r) => r[col] === val); return chain; },
        is(col: string, val: any) { filtres.push((r) => (r[col] ?? null) === val); return chain; },
        in(col: string, vals: any[]) { filtres.push((r) => vals.includes(r[col])); return chain; },
        maybeSingle() {
          const trouve = (tables[table] || []).find((r) => filtres.every((f) => f(r))) ?? null;
          return Promise.resolve({ data: trouve, error: null });
        },
        update(payload: any) {
          const appliquer = (predicat: (r: any) => boolean) => {
            (tables[table] || []).filter((r) => filtres.every((f) => f(r)) && predicat(r)).forEach((r) => Object.assign(r, payload));
            return Promise.resolve({ error: null });
          };
          return {
            eq: (col: string, val: any) => appliquer((r) => r[col] === val),
            in: (col: string, vals: any[]) => appliquer((r) => vals.includes(r[col])),
          };
        },
        insert(payload: any) { return insertInto(table, payload); },
        then(resolve: any) {
          resolve({ data: (tables[table] || []).filter((r) => filtres.every((f) => f(r))), error: null });
        },
      };
      return chain;
    },
  };
  return { sb, tables, evenements, audits };
}

const base = { id: 'r1', pharmacie_id: 'ph1', statut: 'en_attente', choix_patient: null, opt_out: false, consentement_sms_horodatage: '2026-09-01', groupe_id: null };

describe('supprimerRappelAction', () => {
  it('supprime logiquement un rappel sans réponse et trace l\'audit', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base }] });
    const r = await supprimerRappelAction(db.sb, { pharmacieId: 'ph1', vendeurSub: null, callerUserId: 'u1', rappelId: 'r1' });
    expect(r.status).toBe(200);
    expect(db.tables.rappels_ordonnance[0].supprime_le).toBeTruthy();
    expect(db.audits[0]).toMatchObject({ action: 'delete_rappel', user_role: 'titulaire' });
    expect(db.audits[0].metadata.consentement_sms_horodatage).toBe('2026-09-01');
  });

  it('refuse le rappel d\'une autre pharmacie comme introuvable, sans rien modifier', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, pharmacie_id: 'ph2' }] });
    const r = await supprimerRappelAction(db.sb, { pharmacieId: 'ph1', vendeurSub: null, callerUserId: 'u1', rappelId: 'r1' });
    expect(r.status).toBe(404);
    expect(db.tables.rappels_ordonnance[0].supprime_le).toBeUndefined();
  });

  it('refuse la suppression d\'un rappel déjà répondu (409)', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'a_traiter', choix_patient: 'tout_renouveler' }] });
    const r = await supprimerRappelAction(db.sb, { pharmacieId: 'ph1', vendeurSub: null, callerUserId: 'u1', rappelId: 'r1' });
    expect(r.status).toBe(409);
    expect(db.tables.rappels_ordonnance[0].supprime_le).toBeUndefined();
  });

  it('exige une pharmacie et un identifiant (403 / 400)', async () => {
    const db = makeDb({ rappels_ordonnance: [] });
    expect((await supprimerRappelAction(db.sb, { pharmacieId: null, vendeurSub: null, callerUserId: null, rappelId: 'r1' })).status).toBe(403);
    expect((await supprimerRappelAction(db.sb, { pharmacieId: 'ph1', vendeurSub: null, callerUserId: null, rappelId: undefined })).status).toBe(400);
  });

  it('un rappel déjà supprimé est introuvable', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, supprime_le: '2026-10-01' }] });
    expect((await supprimerRappelAction(db.sb, { pharmacieId: 'ph1', vendeurSub: null, callerUserId: null, rappelId: 'r1' })).status).toBe(404);
  });
});

describe('preparerRappelAction', () => {
  const casier = (n: number | null, err: string | null = null) => async () => ({ numero: n, error: err });
  const prefixe = () => 'AB';

  it('attribue un casier à un rappel seul', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'a_traiter', choix_patient: 'partiel' }] });
    const r = await preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r1', incrementerCompteur: casier(7), prefixe });
    expect(r.body).toMatchObject({ data: { caseCode: 'AB07', nombreOrdonnances: 1 } });
    expect(db.tables.rappels_ordonnance[0]).toMatchObject({ statut: 'prepare', case_code: 'AB07' });
  });

  it('un casier unique pour tout un groupe de renouvellements', async () => {
    const db = makeDb({ rappels_ordonnance: [
      { ...base, id: 'r1', statut: 'a_traiter', choix_patient: 'tout_renouveler', groupe_id: 'g1' },
      { ...base, id: 'r2', statut: 'a_traiter', choix_patient: 'partiel', groupe_id: 'g1' },
      { ...base, id: 'r3', statut: 'a_traiter', choix_patient: 'rien', groupe_id: 'g1' },
    ] });
    const r = await preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r1', incrementerCompteur: casier(3), prefixe });
    expect(r.body).toMatchObject({ data: { caseCode: 'AB03', nombreOrdonnances: 2 } });
    const [a, b, c] = db.tables.rappels_ordonnance;
    expect(a.case_code).toBe('AB03');
    expect(b.case_code).toBe('AB03');
    expect(c.case_code).toBeUndefined(); // "rien" n'est pas préparé
  });

  it('n\'inclut pas un membre en opposition ou d\'une autre pharmacie', async () => {
    const db = makeDb({ rappels_ordonnance: [
      { ...base, id: 'r1', statut: 'a_traiter', choix_patient: 'tout_renouveler', groupe_id: 'g1' },
      { ...base, id: 'r2', statut: 'a_traiter', choix_patient: 'partiel', groupe_id: 'g1', opt_out: true },
      { ...base, id: 'r3', statut: 'a_traiter', choix_patient: 'partiel', groupe_id: 'g1', pharmacie_id: 'ph2' },
    ] });
    const r = await preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r1', incrementerCompteur: casier(1), prefixe });
    expect(r.body).toMatchObject({ data: { nombreOrdonnances: 1 } });
    expect(db.tables.rappels_ordonnance.map((x) => x.case_code)).toEqual(['AB01', undefined, undefined]);
  });

  it('refuse un rappel pas à traiter (409) ou un choix "rien" (409)', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, id: 'r1', statut: 'en_attente' }, { ...base, id: 'r2', statut: 'a_traiter', choix_patient: 'rien' }] });
    expect((await preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r1', incrementerCompteur: casier(1), prefixe })).status).toBe(409);
    expect((await preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r2', incrementerCompteur: casier(1), prefixe })).status).toBe(409);
  });

  it('échec du compteur de casiers : erreur, aucune mise à jour', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'a_traiter', choix_patient: 'partiel' }] });
    await expect(preparerRappelAction(db.sb, { pharmacieId: 'ph1', rappelId: 'r1', incrementerCompteur: casier(null, 'panne'), prefixe })).rejects.toThrow('panne');
    expect(db.tables.rappels_ordonnance[0].statut).toBe('a_traiter');
  });
});

describe('repondreRappelAction', () => {
  it('"tout renouveler" passe le rappel à a_traiter et trace la réponse', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'sms_envoye', token: 'TOK' }] });
    const r = await repondreRappelAction(db.sb, { token: 'TOK', choix: 'tout_renouveler' });
    expect(r.status).toBe(200);
    expect(db.tables.rappels_ordonnance[0]).toMatchObject({ statut: 'a_traiter', choix_patient: 'tout_renouveler', opt_out: false });
    expect(db.evenements[0]).toMatchObject({ type: 'reponse_patient' });
  });

  it('"partiel" passe à a_appeler ; "stop" pose l\'opposition', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'sms_envoye', token: 'A' }, { ...base, id: 'r2', statut: 'sms_envoye', token: 'B' }] });
    await repondreRappelAction(db.sb, { token: 'A', choix: 'partiel' });
    await repondreRappelAction(db.sb, { token: 'B', choix: 'stop' });
    expect(db.tables.rappels_ordonnance[0].statut).toBe('a_appeler');
    expect(db.tables.rappels_ordonnance[1]).toMatchObject({ statut: 'a_traiter', opt_out: true });
  });

  it('une seconde réponse est refusée (409) et ne modifie rien', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'a_traiter', choix_patient: 'rien', token: 'TOK' }] });
    const r = await repondreRappelAction(db.sb, { token: 'TOK', choix: 'tout_renouveler' });
    expect(r.status).toBe(409);
    expect(db.tables.rappels_ordonnance[0].choix_patient).toBe('rien');
  });

  it('lien inconnu ou rappel supprimé : 404', async () => {
    const db = makeDb({ rappels_ordonnance: [{ ...base, statut: 'sms_envoye', token: 'TOK', supprime_le: '2026-10-01' }] });
    expect((await repondreRappelAction(db.sb, { token: 'TOK', choix: 'rien' })).status).toBe(404);
    expect((await repondreRappelAction(db.sb, { token: 'INCONNU', choix: 'rien' })).status).toBe(404);
  });

  it('applique la réponse à tout le groupe, pas au seul porteur', async () => {
    const db = makeDb({ rappels_ordonnance: [
      { ...base, id: 'r1', statut: 'sms_envoye', token: 'TOK', groupe_id: 'g1' },
      { ...base, id: 'r2', statut: 'sms_envoye', token: null, groupe_id: 'g1' },
      { ...base, id: 'r3', statut: 'sms_envoye', token: null, groupe_id: 'g1', pharmacie_id: 'ph2' },
    ] });
    await repondreRappelAction(db.sb, { token: 'TOK', choix: 'tout_renouveler' });
    expect(db.tables.rappels_ordonnance.map((x) => x.statut)).toEqual(['a_traiter', 'a_traiter', 'sms_envoye']);
  });
});
