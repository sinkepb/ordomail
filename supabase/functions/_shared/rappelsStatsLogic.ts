// ─── Calcul des statistiques d'efficacité des rappels ──────────────────────
// 01/10/2026 (audit DevOps) — extrait de secure-data/index.ts:rappels_stats,
// jusqu'ici la seule logique non triviale du fichier sans aucun test (toutes
// les resources d'une closure Deno.serve unique ne sont pas unitairement
// testables ; cette fonction pure l'est, même schéma que rappelLogic.ts).
//
// Dénominateur multi-canal (01/10/2026) — tauxReponse/tauxRenouvellement
// divisaient par le nombre de SMS envoyés seul, alors qu'un patient en mode
// "appel" (sans mobile) n'a JAMAIS d'évènement sms_envoye : sa réponse
// gonflait le numérateur sans jamais compter au dénominateur, pouvant
// pousser le taux au-dessus de 100 % pour une pharmacie avec des patients
// sans mobile. `contactes` compte chaque rappel UNE fois s'il a été
// réellement contacté, SMS ou appel confondus.
export interface RappelPourStats {
  id: string;
  statut: string;
}

export interface EvenementPourStats {
  rappel_id: string;
  type: string;
  meta?: { choix?: string; [k: string]: unknown } | null;
  created_at: string;
}

export interface RappelsStatsResult {
  rappelsActifs: number;
  rappelsTotal: number;
  smsEnvoyes90j: number;
  echecs90j: number;
  tauxReponse: number;
  tauxRenouvellement: number;
  delaiReponseMoyenHeures: number | null;
  choixCounts: Record<string, number>;
}

export function computeRappelsStats(rappels: RappelPourStats[], evenements: EvenementPourStats[]): RappelsStatsResult {
  const parRappel = new Map<string, EvenementPourStats[]>();
  for (const e of evenements) {
    if (!parRappel.has(e.rappel_id)) parRappel.set(e.rappel_id, []);
    parRappel.get(e.rappel_id)!.push(e);
  }

  let smsEnvoyes = 0, reponses = 0, echecs = 0, sommeDelaisMs = 0, nbDelais = 0, contactes = 0;
  const choixCounts: Record<string, number> = { tout_renouveler: 0, rien: 0, partiel: 0, stop: 0 };

  for (const evts of parRappel.values()) {
    const tries = [...evts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let dernierEnvoiAt: string | null = null;
    let futContacte = false;
    for (const e of tries) {
      // relance_envoyee — un SMS de relance est un SMS réel envoyé (et
      // facturé) comme le premier ; absent jusqu'au 01/10/2026 du total.
      if (e.type === "sms_envoye" || e.type === "relance_envoyee") {
        smsEnvoyes++;
        dernierEnvoiAt = e.created_at;
        futContacte = true;
      }
      if (e.type === "a_appeler") futContacte = true;
      if (e.type === "sms_echec") echecs++;
      if (e.type === "reponse_patient") {
        reponses++;
        if (e.meta?.choix && choixCounts[e.meta.choix] !== undefined) choixCounts[e.meta.choix]++;
        if (dernierEnvoiAt) {
          sommeDelaisMs += new Date(e.created_at).getTime() - new Date(dernierEnvoiAt).getTime();
          nbDelais++;
        }
      }
    }
    if (futContacte) contactes++;
  }

  // "prepare" (médicament préparé, en attente de retrait) est un cycle
  // toujours en cours, pas résolu : compte comme actif. "a_appeler" — un
  // patient en attente d'un coup de fil n'est pas moins actif qu'un SMS en
  // attente de réponse.
  const rappelsActifs = rappels.filter((r) =>
    r.statut === "en_attente" || r.statut === "sms_envoye" || r.statut === "a_appeler" || r.statut === "a_traiter" || r.statut === "prepare"
  ).length;

  return {
    rappelsActifs,
    rappelsTotal: rappels.length,
    smsEnvoyes90j: smsEnvoyes,
    echecs90j: echecs,
    tauxReponse: contactes > 0 ? Math.round((reponses / contactes) * 100) : 0,
    tauxRenouvellement: contactes > 0 ? Math.round(((choixCounts.tout_renouveler + choixCounts.partiel) / contactes) * 100) : 0,
    delaiReponseMoyenHeures: nbDelais > 0 ? Math.round((sommeDelaisMs / nbDelais / 3600000) * 10) / 10 : null,
    choixCounts,
  };
}
