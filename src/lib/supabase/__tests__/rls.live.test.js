// Tests RLS "live" — vérifient le comportement RÉEL des policies contre le
// projet Supabase (pas des assertions sur le contenu de migrations SQL, qui ne
// prouvent rien sur ce qui est effectivement appliqué en base — voir le
// dossier d'audit du 27/07/2026 : plusieurs bugs de production cette semaine
// (offre_interets, stories_content, pin_verification_attempts/submission_log)
// n'ont été détectés que par des appels REST directs, jamais par une simple
// relecture des fichiers de migration).
//
// Nécessite des secrets dédiés (jamais les vraies clés de prod dans .env.local
// commité) :
//   RLS_TEST_SUPABASE_URL          (à défaut : VITE_SUPABASE_URL)
//   RLS_TEST_ANON_KEY              (à défaut : VITE_SUPABASE_ANON_KEY)
//   RLS_TEST_SERVICE_ROLE_KEY      (requis — bypass RLS pour poser/vérifier les fixtures)
//   RLS_TEST_JWT_SECRET            (requis — doit être le même ORDOMAIL_JWT_SECRET que la prod/staging visée)
//
// Sans RLS_TEST_SERVICE_ROLE_KEY et RLS_TEST_JWT_SECRET, toute la suite est
// SKIPPÉE (ne bloque jamais un contributeur sans accès à ces secrets, mais
// tourne en CI dès qu'ils sont configurés comme secrets du dépôt).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { signToken } from '../../../../supabase/functions/_shared/jwt.ts';

const SUPABASE_URL = process.env.RLS_TEST_SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL;
const ANON_KEY      = process.env.RLS_TEST_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.RLS_TEST_SERVICE_ROLE_KEY;
const JWT_SECRET     = process.env.RLS_TEST_JWT_SECRET;

const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY && JWT_SECRET);

describe.skipIf(!canRun)('RLS live — offre_interets, rate-limit, stories_content, admin RPC', () => {
  let anon, service;
  let testPharmacieId;
  const TEST_EMAIL = `rls-test-${Date.now()}@ordomail-test.invalid`;

  beforeAll(async () => {
    anon = createClient(SUPABASE_URL, ANON_KEY);
    service = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: ph, error } = await service.from('pharmacies')
      .insert({ nom: '__RLS_TEST__', email: TEST_EMAIL })
      .select('id').single();
    if (error) throw new Error(`Fixture pharmacie : ${error.message}`);
    testPharmacieId = ph.id;
  });

  afterAll(async () => {
    if (testPharmacieId) {
      // ON DELETE CASCADE nettoie offre_interets/appels_patient/story_metrics liés.
      await service.from('pharmacies').delete().eq('id', testPharmacieId);
    }
  });

  describe('offre_interets — marquage d\'intérêt patient', () => {
    const codePatient = '9RL' ; // 3 chiffres + 1 lettre, format réel généré côté patient
    const dateJour = new Date().toISOString().split('T')[0];

    afterAll(async () => {
      await service.from('offre_interets').delete().eq('pharmacie_id', testPharmacieId);
    });

    it('anon peut INSERT une ligne (marquage d\'intérêt initial)', async () => {
      const { error } = await anon.from('offre_interets').insert({
        pharmacie_id: testPharmacieId, code_patient: codePatient,
        offre_id: null, offre_titre: 'Offre de test', date_jour: dateJour, actif: true,
      });
      expect(error).toBeNull();
    });

    // ⚠️ BUG OUVERT, NON RÉSOLU (27/07/2026) : ce test échoue actuellement en
    // direct contre le projet de prod — l'UPDATE renvoie un succès HTTP (204,
    // pas d'erreur) mais la ligne n'est PAS modifiée. Confirmé via EXPLAIN
    // (VERBOSE) : le plan affiche "One-Time Filter: false" alors que la seule
    // policy UPDATE applicable est USING(true)/WITH CHECK(true) — comportement
    // reproduit de façon identique en SQL brut (SET ROLE anon) et via l'API
    // REST réelle, y compris sur des lignes fraîchement créées (donc pas un
    // problème de cache de plan lié à une ligne précise). Cause probable :
    // anomalie côté Supabase (pooler/planner) plutôt qu'un problème de policy —
    // reste à investiguer avec le support Supabase. Ne PAS affaiblir cette
    // assertion pour la faire passer : elle documente le comportement attendu
    // et sert de test de non-régression pour le jour où la cause sera trouvée.
    it('anon peut UPDATE une ligne existante via filtre (pas upsert/ON CONFLICT)', async () => {
      // ⚠️ Ne PAS utiliser .upsert(...,{onConflict}) dans ce test : ON CONFLICT DO
      // UPDATE exige une visibilité SELECT que anon n'a jamais sur cette table —
      // exactement le bug confirmé en direct le 27/07/2026 (voir PatientPage.jsx).
      const { error } = await anon.from('offre_interets')
        .update({ actif: false })
        .eq('pharmacie_id', testPharmacieId)
        .eq('code_patient', codePatient)
        .eq('date_jour', dateJour);
      expect(error).toBeNull();

      const { data } = await service.from('offre_interets')
        .select('actif').eq('pharmacie_id', testPharmacieId).eq('code_patient', codePatient).single();
      expect(data.actif).toBe(false);
    });

    it('anon ne peut PAS lire la table (aucune policy SELECT pour anon)', async () => {
      const { data, error } = await anon.from('offre_interets')
        .select('*').eq('pharmacie_id', testPharmacieId);
      // RLS filtre silencieusement (pas d'erreur), la ligne existe pourtant
      // (confirmée côté service role juste au-dessus) — la preuve du blocage
      // est l'écart entre les deux lectures.
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe('pin_verification_attempts / submission_log — rate-limit non contournable', () => {
    let attemptId, logId;

    beforeAll(async () => {
      const { data: a } = await service.from('pin_verification_attempts')
        .insert({ pharmacie_id: testPharmacieId }).select('id').single();
      attemptId = a.id;
      const { data: l } = await service.from('submission_log')
        .insert({ pharmacie_id: testPharmacieId }).select('id').single();
      logId = l.id;
    });

    it('anon ne peut pas lire pin_verification_attempts (GRANT SELECT révoqué, pas seulement filtré par RLS)', async () => {
      const { error } = await anon.from('pin_verification_attempts').select('*').eq('id', attemptId);
      expect(error?.code).toBe('42501');
    });

    it('anon ne peut pas supprimer pin_verification_attempts (le compteur de rate-limit doit survivre)', async () => {
      await anon.from('pin_verification_attempts').delete().eq('id', attemptId);
      const { data } = await service.from('pin_verification_attempts').select('id').eq('id', attemptId);
      expect(data).toHaveLength(1); // toujours là
    });

    it('anon ne peut pas lire submission_log (GRANT SELECT révoqué, pas seulement filtré par RLS)', async () => {
      const { error } = await anon.from('submission_log').select('*').eq('id', logId);
      expect(error?.code).toBe('42501');
    });

    it('anon ne peut pas supprimer submission_log (le compteur de rate-limit doit survivre)', async () => {
      await anon.from('submission_log').delete().eq('id', logId);
      const { data } = await service.from('submission_log').select('id').eq('id', logId);
      expect(data).toHaveLength(1);
    });
  });

  describe('stories_content — catalogue public en lecture, actif uniquement', () => {
    let storyId;

    beforeAll(async () => {
      const { data } = await service.from('stories_content')
        .insert({ titre: '__RLS_TEST_STORY__', type: 'info', contenu: 'x', actif: true })
        .select('id').single();
      storyId = data.id;
    });

    afterAll(async () => {
      if (storyId) await service.from('stories_content').delete().eq('id', storyId);
    });

    it('anon voit une story active', async () => {
      const { data, error } = await anon.from('stories_content').select('id').eq('id', storyId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('anon ne voit plus une story désactivée', async () => {
      await service.from('stories_content').update({ actif: false }).eq('id', storyId);
      const { data } = await anon.from('stories_content').select('id').eq('id', storyId);
      expect(data).toHaveLength(0);
    });
  });

  describe('Fonctions admin — non exécutables directement par anon', () => {
    it('verify_admin_login refuse anon (EXECUTE révoqué de PUBLIC)', async () => {
      const { error } = await anon.rpc('verify_admin_login', { p_email: 'x@x.fr', p_password: 'x' });
      expect(error).not.toBeNull();
    });

    it('verify_admin_password refuse anon', async () => {
      const { error } = await anon.rpc('verify_admin_password', { p_email: 'x@x.fr', p_password: 'x' });
      expect(error).not.toBeNull();
    });

    it('check_admin_password refuse anon', async () => {
      const { error } = await anon.rpc('check_admin_password', { p_hash: 'x', p_password: 'x' });
      expect(error).not.toBeNull();
    });
  });

  describe('Storage — buckets privés', () => {
    it('ordonnances-files et logos-pharmacies ne sont pas publics', async () => {
      const { data, error } = await service.storage.listBuckets();
      expect(error).toBeNull();
      const byId = Object.fromEntries((data || []).map(b => [b.id, b]));
      expect(byId['ordonnances-files']?.public).toBe(false);
      expect(byId['logos-pharmacies']?.public).toBe(false);
    });
  });

  describe('Jeton vendeur — secure-data scope correctement à sa pharmacie', () => {
    it('un jeton vendeur valide pour la pharmacie de test obtient ses propres infos', async () => {
      const token = await signToken({ role: 'vendeur', pharmacie_id: testPharmacieId }, JWT_SECRET, 3600);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/secure-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ resource: 'pharmacie_info', params: {} }),
      });
      const body = await res.json();
      expect(res.ok).toBe(true);
      expect(body.data?.id).toBe(testPharmacieId);
    });

    it('un jeton vendeur signé avec un mauvais secret est rejeté', async () => {
      const token = await signToken({ role: 'vendeur', pharmacie_id: testPharmacieId }, 'mauvais-secret', 3600);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/secure-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ resource: 'pharmacie_info', params: {} }),
      });
      expect(res.ok).toBe(false);
    });
  });
});
