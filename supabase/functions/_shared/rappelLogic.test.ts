// Tests unitaires — logique des rappels de renouvellement.
// @fix 24/09/2026 (audit) — le scan cron (runRappelScan) n'avait aucun test
// malgré son rôle central (SMS + écritures pour chaque rappel dû) ; seul le
// texte du message était vérifiable "à l'œil". sendSms est mocké (aucun envoi
// réel), le client Supabase est un faux minimal reproduisant les chaînes
// utilisées par rappelLogic.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRappelLien, buildRappelMessage, runRappelScan } from './rappelLogic.ts';

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

    expect(result).toEqual({ scanned: 3, sent: 2, failed: 1 });
    // Seuls les 2 envois réussis mettent à jour rappels_ordonnance.
    expect(updates.filter((u) => u.table === 'rappels_ordonnance')).toHaveLength(2);
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

    expect(result).toEqual({ scanned: 2, sent: 1, failed: 1 });
  });

  it('aucun rappel dû : ne fait aucun appel SMS', async () => {
    const { sb } = makeMockSupabase([]);
    const result = await runRappelScan(sb, 'https://ordomail.fr');
    expect(result).toEqual({ scanned: 0, sent: 0, failed: 0 });
    expect(sendSms).not.toHaveBeenCalled();
  });
});
