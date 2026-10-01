// Tests unitaires — logique des rappels de renouvellement.
// @fix 24/09/2026 (audit) — le scan cron (runRappelScan) n'avait aucun test
// malgré son rôle central (SMS + écritures pour chaque rappel dû) ; seul le
// texte du message était vérifiable "à l'œil". sendSms est mocké (aucun envoi
// réel), le client Supabase est un faux minimal reproduisant les chaînes
// utilisées par rappelLogic.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRappelLien, buildRappelMessage, runRappelScan, runRelanceEtEscaladeScan } from './rappelLogic.ts';

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

// Faux client Supabase minimal — reproduit uniquement les chaînes utilisées
// par runRappelScan : .from(...).select().eq().eq().lte() (lecture, thenable)
// et .from(...).update(...).eq(...) / .from(...).insert(...) (écriture).
function makeMockSupabase(dus: any[]) {
  const updates: any[] = [];
  const inserts: any[] = [];
  const sb: any = {
    from(table: string) {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        lte() { return chain; },
        limit() { return chain; },
        update(payload: any) {
          updates.push({ table, payload });
          return { eq: () => Promise.resolve({ error: null }) };
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
