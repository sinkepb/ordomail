// Tests unitaires — logique des rappels de renouvellement.
// @fix 24/09/2026 (audit) — le scan cron (runRappelScan) n'avait aucun test
// malgré son rôle central (SMS + écritures pour chaque rappel dû) ; seul le
// texte du message était vérifiable "à l'œil". sendSms est mocké (aucun envoi
// réel), le client Supabase est un faux minimal reproduisant les chaînes
// utilisées par rappelLogic.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRappelLien, buildRappelMessage, buildRappelMessageGroupe, regrouperParTelephone, runRappelScan, runRelanceEtEscaladeScan, canSupprimerRappel } from './rappelLogic.ts';

vi.mock('./sms.ts', () => ({ sendSms: vi.fn() }));
vi.mock('./shortToken.ts', () => ({ generateShortToken: () => 'TOKEN123' }));

import { sendSms } from './sms.ts';

describe('buildRappelLien', () => {
  it('assemble l\'URL courte avec le token', () => {
    expect(buildRappelLien('https://ordomail.fr', 'abc123')).toBe('https://ordomail.fr/?r=abc123');
  });
});

describe('buildRappelMessage', () => {
  it('message minimal sans médecin ni spécialité', () => {
    const msg = buildRappelMessage('Jean', 'Dupont', 'https://ordomail.fr/?r=x', 'Pharmacie du Centre');
    expect(msg).toContain('Bonjour M/Mme Jean Dupont');
    expect(msg).toContain('Pharmacie du Centre vous informe que votre renouvellement');
    expect(msg).toContain('https://ordomail.fr/?r=x');
  });

  it('inclut médecin + spécialité quand renseignés', () => {
    const msg = buildRappelMessage('Jean', 'Dupont', 'https://ordomail.fr/?r=x', 'Pharmacie du Centre', 'Dr Martin', 'Cardiologie');
    expect(msg).toContain('Cardiologie, Dr Martin');
  });

  it('n\'utilise que le champ renseigné si un seul des deux est présent', () => {
    const avecMedecinSeul = buildRappelMessage('Jean', 'Dupont', 'https://x', 'Pharma', 'Dr Martin', undefined);
    expect(avecMedecinSeul).toContain('(Dr Martin)');
    const avecSpecialiteSeule = buildRappelMessage('Jean', 'Dupont', 'https://x', 'Pharma', undefined, 'Cardiologie');
    expect(avecSpecialiteSeule).toContain('(Cardiologie)');
  });

  it('tronque le détail médecin+spécialité à 35 caractères (ne fait pas basculer le SMS sur un segment supplémentaire)', () => {
    const specialiteLongue = 'Oto-rhino-laryngologie pédiatrique';
    const msg = buildRappelMessage('Jean', 'Dupont', 'https://x', 'Pharma', 'Dr Martin', specialiteLongue);
    const detailMatch = msg.match(/\(([^)]+)\)/);
    expect(detailMatch?.[1].length).toBeLessThanOrEqual(35);
  });
});

describe('buildRappelMessageGroupe', () => {
  it('mentionne le nombre d\'ordonnances, sans détail médecin/spécialité', () => {
    const msg = buildRappelMessageGroupe('Jean', 'Dupont', 'https://ordomail.fr/?r=x', 'Pharmacie du Centre', 3);
    expect(msg).toContain('Bonjour M/Mme Jean Dupont');
    expect(msg).toContain('le renouvellement de 3 de vos ordonnances');
    expect(msg).toContain('https://ordomail.fr/?r=x');
  });
});

// @fix 03/10/2026 (retour pharmacien) — un patient avec plusieurs
// ordonnances chroniques recevait un SMS par ordonnance ; regrouperParTelephone
// est la fonction pure qui décide quels rappels dus partent ensemble.
describe('regrouperParTelephone', () => {
  it('regroupe deux rappels du même patient (même pharmacie, même téléphone)', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
      { id: 'r2', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
    ];
    expect(regrouperParTelephone(rappels)).toEqual([rappels]);
  });

  it('deux écritures différentes du même numéro (+33 vs 0) sont regroupées', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '+33612345678' },
      { id: 'r2', pharmacie_id: 'ph1', patient_telephone: '0612345678' },
    ];
    expect(regrouperParTelephone(rappels)).toEqual([rappels]);
  });

  it('ne regroupe pas des téléphones différents', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
      { id: 'r2', pharmacie_id: 'ph1', patient_telephone: '0600000002' },
    ];
    expect(regrouperParTelephone(rappels)).toEqual([[rappels[0]], [rappels[1]]]);
  });

  it('ne regroupe pas le même numéro entre deux pharmacies différentes', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
      { id: 'r2', pharmacie_id: 'ph2', patient_telephone: '0600000001' },
    ];
    expect(regrouperParTelephone(rappels)).toEqual([[rappels[0]], [rappels[1]]]);
  });

  it('un numéro fixe ("appel") n\'est jamais regroupé, même avec un autre rappel du même numéro', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '0600000001', mode_contact: 'appel' },
      { id: 'r2', pharmacie_id: 'ph1', patient_telephone: '0600000001', mode_contact: 'sms' },
    ];
    expect(regrouperParTelephone(rappels)).toEqual([[rappels[0]], [rappels[1]]]);
  });

  it('trois rappels du même patient forment un seul groupe de 3', () => {
    const rappels = [
      { id: 'r1', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
      { id: 'r2', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
      { id: 'r3', pharmacie_id: 'ph1', patient_telephone: '0600000001' },
    ];
    const groupes = regrouperParTelephone(rappels);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]).toHaveLength(3);
  });
});

// Faux client Supabase minimal — reproduit uniquement les chaînes utilisées
// par runRappelScan : .from(...).select().eq().eq().lte() (lecture, thenable)
// et .from(...).update(...).eq(...) / .from(...).insert(...) (écriture).
// opts.updateError (01/10/2026, audit DevOps) — les écritures renvoyaient
// toujours { error: null } jusqu'ici, donc aucun test ne pouvait détecter
// qu'un échec Postgrest (Supabase-js ne lève pas d'exception) était ignoré
// par rappelLogic.ts. Permet de simuler un UPDATE qui échoue réellement.
function makeMockSupabase(dus: any[], opts: { updateError?: string } = {}) {
  const updates: any[] = [];
  const inserts: any[] = [];
  const sb: any = {
    from(table: string) {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        lte() { return chain; },
        is() { return chain; },
        limit() { return chain; },
        update(payload: any) {
          const entry = { table, payload, ids: [] as any[] };
          updates.push(entry);
          const res = (_col: string, val: any) => {
            entry.ids = Array.isArray(val) ? val : [val];
            return Promise.resolve(opts.updateError ? { error: { message: opts.updateError } } : { error: null });
          };
          return { eq: res, in: res };
        },
        insert(payload: any) {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        then(resolve: any) {
          resolve({ data: dus, error: null });
        },
      };
      return chain;
    },
  };
  return { sb, updates, inserts };
}

describe('runRappelScan', () => {
  beforeEach(() => {
    vi.mocked(sendSms).mockReset();
  });

  it('envoie un SMS par rappel dû et compte sent/failed correctement', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Marie', patient_nom: 'Durand', patient_telephone: '0600000002', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r3', pharmacie_id: 'ph1', patient_prenom: 'Paul', patient_nom: 'Petit', patient_telephone: '0600000003', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms)
      .mockResolvedValueOnce({ success: true, mocked: true })
      .mockResolvedValueOnce({ success: false, mocked: false, error: 'échec opérateur' })
      .mockResolvedValueOnce({ success: true, mocked: true });

    const { sb, updates, inserts } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 3, sent: 2, failed: 1, appeler: 0 });
    // 2 envois réussis + 1 échec qui incrémente son compteur (voir
    // sms_echecs_consecutifs) sans changer de statut (sous le seuil d'escalade).
    expect(updates.filter((u) => u.table === 'rappels_ordonnance')).toHaveLength(3);
    const majEchec = updates.find((u) => u.payload.sms_echecs_consecutifs === 1 && !u.payload.statut);
    expect(majEchec).toBeTruthy();
    // 3 événements journalisés (2 succès + 1 échec).
    const evenements = inserts.filter((i) => i.table === 'rappels_evenements');
    expect(evenements).toHaveLength(3);
    expect(evenements.filter((e) => e.payload.type === 'sms_envoye')).toHaveLength(2);
    expect(evenements.filter((e) => e.payload.type === 'sms_echec')).toHaveLength(1);
  });

  it('une exception sur un rappel ne bloque pas le traitement des autres', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Marie', patient_nom: 'Durand', patient_telephone: '0600000002', pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms)
      .mockRejectedValueOnce(new Error('timeout réseau'))
      .mockResolvedValueOnce({ success: true, mocked: true });

    const { sb } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 2, sent: 1, failed: 1, appeler: 0 });
  });

  // @fix 03/10/2026 (retour pharmacien) — plusieurs rappels dus le même jour
  // pour le même patient partent en UN SEUL SMS, pas un par ordonnance.
  it('regroupe 2 rappels du même patient en un seul SMS avec groupe_id partagé', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb, updates, inserts } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 2, sent: 2, failed: 0, appeler: 0 });
    expect(sendSms).toHaveBeenCalledTimes(1); // un seul SMS pour les 2 rappels
    const [, message] = vi.mocked(sendSms).mock.calls[0];
    expect(message).toContain('le renouvellement de 2 de vos ordonnances');

    // Le porteur (r1) reçoit le token ; l'autre (r2) non, mais les deux
    // partagent le même groupe_id et passent "sms_envoye".
    const majPorteur = updates.find((u) => u.ids.includes('r1') && u.payload.token);
    expect(majPorteur?.payload).toMatchObject({ statut: 'sms_envoye' });
    const majAutre = updates.find((u) => u.ids.includes('r2'));
    expect(majAutre?.payload).toMatchObject({ statut: 'sms_envoye' });
    expect(majAutre?.payload.token).toBeUndefined();
    expect(majAutre?.payload.groupe_id).toBe(majPorteur?.payload.groupe_id);
    expect(majPorteur?.payload.groupe_id).toBeTruthy();

    const evenements = inserts.filter((i) => i.table === 'rappels_evenements');
    expect(evenements).toHaveLength(2);
    expect(evenements.every((e) => e.payload.meta?.groupe === true)).toBe(true);
  });

  it('un échec d\'envoi sur un groupe est partagé par tous ses membres', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', sms_echecs_consecutifs: 2, medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', sms_echecs_consecutifs: 2, medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: false, mocked: false, error: 'numéro invalide' });

    const { sb, updates } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 2, sent: 0, failed: 2, appeler: 0 });
    // 3e échec consécutif -> escalade "à appeler" pour les 2 membres d'un coup.
    const maj = updates.find((u) => u.table === 'rappels_ordonnance');
    expect(maj?.payload).toMatchObject({ statut: 'a_appeler', sms_echecs_consecutifs: 3 });
    expect(maj?.ids.sort()).toEqual(['r1', 'r2']);
  });

  it('un numéro fixe n\'est jamais fusionné avec un envoi SMS du même patient', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', mode_contact: 'appel', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', mode_contact: 'sms', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 2, sent: 1, failed: 0, appeler: 1 });
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('aucun rappel dû : ne fait aucun appel SMS', async () => {
    const { sb } = makeMockSupabase([]);
    const result = await runRappelScan(sb, 'https://ordomail.fr');
    expect(result).toEqual({ scanned: 0, sent: 0, failed: 0, appeler: 0 });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('un rappel en mode "appel" (numéro fixe) passe directement en a_appeler, sans SMS', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0142345678', mode_contact: 'appel', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', pharmacie_id: 'ph1', patient_prenom: 'Marie', patient_nom: 'Durand', patient_telephone: '0600000002', mode_contact: 'sms', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb, updates, inserts } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 2, sent: 1, failed: 0, appeler: 1 });
    expect(sendSms).toHaveBeenCalledTimes(1);
    const evenements = inserts.filter((i) => i.table === 'rappels_evenements');
    expect(evenements.filter((e) => e.payload.type === 'a_appeler')).toHaveLength(1);
    const majAAppeler = updates.find((u) => u.table === 'rappels_ordonnance' && u.payload.statut === 'a_appeler');
    expect(majAAppeler).toBeTruthy();
  });

  // 01/10/2026 (audit) — un échec isolé reste "en_attente" (ré-essayé tout
  // seul au prochain passage), mais un échec permanent (numéro invalide...)
  // ne doit pas retenter indéfiniment en silence : voir SMS_ECHEC_MAX.
  it('bascule en "à appeler" après 3 échecs d\'envoi consécutifs, pas avant', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', sms_echecs_consecutifs: 1, medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: false, mocked: false, error: 'numéro invalide' });

    const { sb, updates, inserts } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 1, appeler: 0 });
    // 2e échec (1 + 1) — sous le seuil de 3, reste "en_attente".
    const maj = updates.find((u) => u.table === 'rappels_ordonnance');
    expect(maj?.payload).toEqual({ sms_echecs_consecutifs: 2 });
    const evenements = inserts.filter((i) => i.table === 'rappels_evenements');
    expect(evenements).toHaveLength(1);
    expect(evenements[0].payload.type).toBe('sms_echec');
  });

  it('bascule en "à appeler" au 3e échec d\'envoi consécutif', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', sms_echecs_consecutifs: 2, medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: false, mocked: false, error: 'numéro invalide' });

    const { sb, updates, inserts } = makeMockSupabase(dus);
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 1, appeler: 0 });
    const maj = updates.find((u) => u.table === 'rappels_ordonnance');
    expect(maj?.payload).toMatchObject({ statut: 'a_appeler', sms_echecs_consecutifs: 3 });
    const evenements = inserts.filter((i) => i.table === 'rappels_evenements');
    expect(evenements).toHaveLength(1);
    expect(evenements[0].payload).toMatchObject({ type: 'a_appeler', meta: { motif: 'echec_envoi', echecs: 3 } });
  });

  // 01/10/2026 (audit DevOps) — avant ce correctif, un SMS envoyé avec
  // succès mais dont l'UPDATE échoue ensuite (verrou, timeout DB...) était
  // quand même compté "sent" : le patient reçoit un lien dont le token n'est
  // jamais enregistré en base, sans que rien ne le signale.
  it('un envoi SMS réussi mais dont l\'UPDATE échoue est compté "failed", pas "sent"', async () => {
    const dus = [
      { id: 'r1', pharmacie_id: 'ph1', patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb } = makeMockSupabase(dus, { updateError: 'connexion DB perdue' });
    const result = await runRappelScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ scanned: 1, sent: 0, failed: 1, appeler: 0 });
  });
});

// Faux client Supabase qui filtre réellement selon .eq()/.lte() (contrairement
// à makeMockSupabase ci-dessus, qui renvoie toujours le même jeu de lignes) —
// nécessaire ici car runRelanceEtEscaladeScan fait deux requêtes successives
// sur la même table avec des filtres mutuellement exclusifs
// (relance_sms_envoyee=false puis =true), qui doivent retourner des résultats
// différents dans un même test.
function makeFilterableMockSupabase(initialRows: any[]) {
  const rows = initialRows.map((r) => ({ ...r }));
  const inserts: any[] = [];
  const sb: any = {
    from(table: string) {
      if (table === 'rappels_evenements') {
        return { insert: (payload: any) => { inserts.push({ table, payload }); return Promise.resolve({ error: null }); } };
      }
      const filters: Array<(r: any) => boolean> = [];
      const chain: any = {
        select() { return chain; },
        eq(col: string, val: any) { filters.push((r) => r[col] === val); return chain; },
        lte(col: string, val: any) { filters.push((r) => r[col] <= val); return chain; },
        is(col: string, val: any) { filters.push((r) => (r[col] ?? null) === val); return chain; },
        limit() { return chain; },
        update(payload: any) {
          return {
            eq: (col: string, val: any) => {
              const row = rows.find((r) => r[col] === val);
              if (row) Object.assign(row, payload);
              return Promise.resolve({ error: null });
            },
          };
        },
        then(resolve: any) {
          resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
        },
      };
      return chain;
    },
  };
  return { sb, rows, inserts };
}

describe('runRelanceEtEscaladeScan', () => {
  beforeEach(() => {
    vi.mocked(sendSms).mockReset();
  });

  it('envoie une relance pour un rappel sans réponse depuis 3+ jours', async () => {
    const il4jours = new Date(Date.now() - 4 * 86400000).toISOString();
    const rows = [
      { id: 'r1', token: 'TOK1', statut: 'sms_envoye', relance_sms_envoyee: false, date_dernier_sms_envoye: il4jours, patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', medecin_prescripteur: null, specialite: null, pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb, rows: rowsApres, inserts } = makeFilterableMockSupabase(rows);
    const result = await runRelanceEtEscaladeScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ relances: 1, escalades: 0 });
    expect(rowsApres[0].relance_sms_envoyee).toBe(true);
    expect(inserts.filter((i) => i.payload.type === 'relance_envoyee')).toHaveLength(1);
    // Même token réutilisé (29/09/2026) — pas de régénération à la relance.
    const [, message] = vi.mocked(sendSms).mock.calls[0];
    expect(message).toContain('?r=TOK1');
    expect(message).toContain('Rappel —');
  });

  it('ne relance pas un rappel envoyé il y a moins de 3 jours', async () => {
    const ilUnJour = new Date(Date.now() - 86400000).toISOString();
    const rows = [
      { id: 'r1', token: 'TOK1', statut: 'sms_envoye', relance_sms_envoyee: false, date_dernier_sms_envoye: ilUnJour, patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', pharmacies: { nom: 'Pharma A' } },
    ];
    const { sb } = makeFilterableMockSupabase(rows);
    const result = await runRelanceEtEscaladeScan(sb, 'https://ordomail.fr');
    expect(result).toEqual({ relances: 0, escalades: 0 });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('escalade en "à appeler" un rappel relancé sans réponse depuis 3+ jours', async () => {
    const il4jours = new Date(Date.now() - 4 * 86400000).toISOString();
    const rows = [
      { id: 'r2', token: 'TOK2', statut: 'sms_envoye', relance_sms_envoyee: true, date_dernier_sms_envoye: il4jours, patient_prenom: 'Marie', patient_nom: 'Durand', patient_telephone: '0600000002', pharmacies: { nom: 'Pharma A' } },
    ];
    const { sb, rows: rowsApres, inserts } = makeFilterableMockSupabase(rows);
    const result = await runRelanceEtEscaladeScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ relances: 0, escalades: 1 });
    expect(rowsApres[0].statut).toBe('a_appeler');
    const evt = inserts.find((i) => i.payload.type === 'a_appeler');
    expect(evt?.payload.meta).toEqual({ motif: 'sans_reponse' });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('traite relance et escalade dans le même passage, sans se marcher dessus', async () => {
    const il4jours = new Date(Date.now() - 4 * 86400000).toISOString();
    const rows = [
      { id: 'r1', token: 'TOK1', statut: 'sms_envoye', relance_sms_envoyee: false, date_dernier_sms_envoye: il4jours, patient_prenom: 'Jean', patient_nom: 'Dupont', patient_telephone: '0600000001', pharmacies: { nom: 'Pharma A' } },
      { id: 'r2', token: 'TOK2', statut: 'sms_envoye', relance_sms_envoyee: true, date_dernier_sms_envoye: il4jours, patient_prenom: 'Marie', patient_nom: 'Durand', patient_telephone: '0600000002', pharmacies: { nom: 'Pharma A' } },
    ];
    vi.mocked(sendSms).mockResolvedValueOnce({ success: true, mocked: true });

    const { sb, rows: rowsApres } = makeFilterableMockSupabase(rows);
    const result = await runRelanceEtEscaladeScan(sb, 'https://ordomail.fr');

    expect(result).toEqual({ relances: 1, escalades: 1 });
    expect(rowsApres.find((r) => r.id === 'r1')?.relance_sms_envoyee).toBe(true);
    expect(rowsApres.find((r) => r.id === 'r2')?.statut).toBe('a_appeler');
  });
});

// @fix 04/10/2026 (audit RGPD) — garde-fou de suppression.
describe('canSupprimerRappel', () => {
  it('autorise la suppression d\'un rappel sans réponse ni opposition', () => {
    expect(canSupprimerRappel({ statut: 'en_attente', choix_patient: null, opt_out: false }).ok).toBe(true);
    expect(canSupprimerRappel({ statut: 'sms_envoye', choix_patient: null }).ok).toBe(true);
  });

  it('refuse un rappel auquel le patient a déjà répondu', () => {
    expect(canSupprimerRappel({ statut: 'a_traiter', choix_patient: 'tout_renouveler' }).ok).toBe(false);
  });

  it('refuse un rappel en opposition, même sans choix enregistré', () => {
    expect(canSupprimerRappel({ statut: 'termine', choix_patient: 'stop', opt_out: true }).ok).toBe(false);
  });

  it('refuse un rappel terminé', () => {
    expect(canSupprimerRappel({ statut: 'termine', choix_patient: null }).ok).toBe(false);
  });
});
