// ─── Métriques journalières (snapshot nocturne + historique) ─────────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase } from './client.js';

// ─── Snapshot métriques journalières ──────────────────────────────────────────
export async function snapshotMetriquesJournalieres() {
  if (IS_DEMO) return;
  const sb = getSupabase();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Charger toutes les pharmacies
  const { data: pharmacies } = await sb.from("pharmacies").select("id, plan");
  if (!pharmacies) return;

  const now30 = new Date(Date.now() - 30*86400000).toISOString();
  const now7  = new Date(Date.now() - 7*86400000).toISOString();
  const now24 = new Date(Date.now() - 86400000).toISOString();
  const today_start = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";

  for (const ph of pharmacies) {
    const [
      { count: total },
      { count: mois },
      { count: semaine },
      { count: jour },
      { count: attente },
      { data: canaux },
      { data: traitees },
    ] = await Promise.all([
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now30),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now7),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",today_start),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).eq("status","nouveau").lte("received_at",now24),
      sb.from("ordonnances").select("source").eq("pharmacie_id",ph.id).gte("received_at",now30),
      // Délai de traitement (envoi → impression) — ordonnances imprimées des 30 derniers jours
      sb.from("ordonnances").select("received_at, printed_at").eq("pharmacie_id",ph.id).gte("received_at",now30).not("printed_at","is",null),
    ]);

    const total_canaux = canaux?.length || 0;
    const qr_pct    = total_canaux ? Math.round((canaux.filter(o=>o.source==="qrcode").length/total_canaux)*100) : 0;
    const email_pct = total_canaux ? Math.round((canaux.filter(o=>o.source==="email").length/total_canaux)*100) : 0;
    const taux = total ? Math.round(((total-(attente||0))/total)*100) : 0;
    const score = Math.min(100, Math.round((mois||0)*0.4 + (semaine||0)*2 + qr_pct*0.2));
    const delais = (traitees||[])
      .map(o => (new Date(o.printed_at) - new Date(o.received_at)) / 60000)
      .filter(m => Number.isFinite(m) && m >= 0);
    const delaiMoyen = delais.length ? Math.round(delais.reduce((a,b)=>a+b,0)/delais.length) : 0;

    // Upsert du snapshot du jour (ON CONFLICT → UPDATE)
    await sb.from("metriques_journalieres").upsert({
      pharmacie_id:     ph.id,
      date:             today,
      ordos_jour:       jour    || 0,
      ordos_semaine:    semaine || 0,
      ordos_mois:       mois    || 0,
      ordos_total:      total   || 0,
      ordos_attente:    attente || 0,
      canal_qr_pct:     qr_pct,
      canal_email_pct:  email_pct,
      taux_traitement:  taux,
      score_activite:   score,
      delai_moyen_min: delaiMoyen,
    }, { onConflict: "pharmacie_id,date" });
  }
}

// Charger l'historique d'une pharmacie
export async function fetchHistoriqueMetriques(pharmacieId, jours = 30) {
  if (IS_DEMO) {
    // Générer des données mock pour la démo
    const data = [];
    for (let i = jours; i >= 0; i--) {
      const d = new Date(Date.now() - i*86400000);
      data.push({
        date:             d.toISOString().split("T")[0],
        ordos_jour:       Math.floor(Math.random()*15)+1,
        ordos_mois:       Math.floor(Math.random()*80)+20,
        taux_traitement:  Math.floor(Math.random()*20)+75,
        delai_moyen_min: Math.floor(Math.random()*20)+5,
        score_activite:   Math.floor(Math.random()*30)+60,
        canal_qr_pct:     Math.floor(Math.random()*30)+50,
      });
    }
    return data;
  }
  const sb = getSupabase();
  const since = new Date(Date.now() - jours*86400000).toISOString().split("T")[0];
  const { data } = await sb
    .from("metriques_journalieres")
    .select("*")
    .eq("pharmacie_id", pharmacieId)
    .gte("date", since)
    .order("date", { ascending: true });
  return data || [];
}
