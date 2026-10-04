// Panneau de suivi des cron jobs — backoffice (05/10/2026). Affiche, pour chaque
// job pg_cron, son état, sa dernière exécution et les échecs récents. Données :
// secure-data-admin:admin_cron_runs (lecture de cron.job / cron.job_run_details).
import { useState, useEffect, useCallback } from "react";
import { resumerJob } from "../lib/cronSummary.js";

const POLL_MS = 60000;

async function callSecureDataAdmin(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${adminToken || ""}` },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `${resource} : erreur ${res.status}`);
  return body.data;
}

const STATUT = {
  ok: { label: "OK", color: "#15803d", bg: "#f0fdf4" },
  erreur: { label: "Erreur", color: "#dc2626", bg: "#fef2f2" },
  jamais: { label: "Jamais lancé", color: "#b45309", bg: "#fffbeb" },
  inactif: { label: "Inactif", color: "#64748b", bg: "#f1f5f9" },
};

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR") : "—";
}

export function CronMonitorPanel({ adminToken }) {
  const [jobs, setJobs] = useState([]);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState(null);

  const charger = useCallback(async () => {
    try {
      const data = await callSecureDataAdmin("admin_cron_runs", { limit: 20 }, adminToken);
      setJobs(data || []);
      setErreur("");
    } catch (e) {
      setErreur(e.message);
    }
    setChargement(false);
  }, [adminToken]);

  useEffect(() => {
    charger();
    const id = setInterval(charger, POLL_MS);
    return () => clearInterval(id);
  }, [charger]);

  if (chargement) return <div style={{ color: "#94a3b8", fontSize: 13 }}>Chargement…</div>;
  if (erreur) return <div style={{ color: "#dc2626", fontSize: 13 }}>Impossible de charger les cron jobs : {erreur}</div>;
  if (jobs.length === 0) return <div style={{ color: "#94a3b8", fontSize: 13 }}>Aucun cron job trouvé.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>⏱ Cron jobs</div>
        <button onClick={charger} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Actualiser</button>
      </div>
      {jobs.map((job) => {
        const r = resumerJob(job);
        const s = STATUT[r.statut];
        return (
          <div key={job.jobid} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{job.jobname}</span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{job.schedule}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, color: s.color, background: s.bg }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
              Dernière exécution : {formatDate(r.derniereExecution)} · Échecs sur 24 h : {r.echecs24h}
            </div>
            {r.derniereErreur && (
              <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, wordBreak: "break-word" }}>Message : {r.derniereErreur}</div>
            )}
            <button onClick={() => setOuvert(ouvert === job.jobid ? null : job.jobid)} style={{ marginTop: 8, background: "none", border: "none", color: "#1a3a6e", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              {ouvert === job.jobid ? "Masquer l'historique" : `Historique (${job.runs.length})`}
            </button>
            {ouvert === job.jobid && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                    <th style={{ padding: "4px 0" }}>Début</th>
                    <th>Statut</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {job.runs.map((run, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "4px 0", whiteSpace: "nowrap" }}>{formatDate(run.start_time)}</td>
                      <td style={{ color: run.status === "succeeded" ? "#15803d" : "#dc2626", fontWeight: 700 }}>{run.status}</td>
                      <td style={{ wordBreak: "break-word", color: "#64748b" }}>{run.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
