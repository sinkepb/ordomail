// Page publique patient d'un rappel de renouvellement d'ordonnance (04/09/2026)
// — lien reçu par SMS (?rappel=<token>), voir App.jsx et
// supabase/functions/resolve-rappel/index.ts. Strictement anonyme, aucune
// dépendance à PatientPage.jsx (pas de code personnel, pas de story carousel).
import { useState, useEffect, useCallback } from "react";

const CHOIX = [
  { key: "tout_renouveler", emoji: "✅", label: "Tout renouveler" },
  { key: "partiel", emoji: "🔶", label: "Renouvellement partiel", sub: "Nous vous contacterons pour préciser" },
  { key: "rien", emoji: "🚫", label: "Ne rien prendre" },
];

// Créneau de retrait (08/09/2026) — demandé uniquement si le patient vient
// chercher quelque chose (pas pour "rien"). Indication large plutôt qu'un
// horaire précise — voir migration 20260908_rappels_creneau_retrait.sql.
const CRENEAUX = [
  { key: "ce_matin", emoji: "🌅", label: "Ce matin" },
  { key: "cet_apres_midi", emoji: "☀️", label: "Cet après-midi" },
  { key: "demain_matin", emoji: "🌤️", label: "Demain matin" },
  { key: "demain_apres_midi", emoji: "🌇", label: "Demain après-midi" },
];

async function callResolveRappel(method, params) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = method === "GET"
    ? `${supabaseUrl}/functions/v1/resolve-rappel?token=${encodeURIComponent(params.token)}`
    : `${supabaseUrl}/functions/v1/resolve-rappel`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    body: method === "POST" ? JSON.stringify(params) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
  return body.data;
}

function RappelChoixPage({ token }) {
  const [state, setState] = useState("chargement"); // chargement | pret | creneau | envoi | merci | erreur
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [choixEnCours, setChoixEnCours] = useState(null);

  useEffect(() => {
    if (!token) { setState("erreur"); setError("Lien invalide."); return; }
    callResolveRappel("GET", { token })
      .then(data => { setInfo(data); setState(data.dejaRepondu ? "merci" : "pret"); })
      .catch(e => { setState("erreur"); setError(e.message); });
  }, [token]);

  const envoyer = useCallback(async (choix, creneau) => {
    setState("envoi");
    try {
      await callResolveRappel("POST", { token, choix, creneau });
      setState("merci");
    } catch (e) {
      setState("erreur");
      setError(e.message);
    }
  }, [token]);

  // "Ne rien prendre" n'a pas de retrait à planifier — envoi direct. Les deux
  // autres choix passent par une étape supplémentaire pour indiquer un
  // créneau de passage (08/09/2026).
  const choisir = useCallback((choix) => {
    if (choix === "rien") { envoyer(choix, null); return; }
    setChoixEnCours(choix);
    setState("creneau");
  }, [envoyer]);

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "linear-gradient(160deg, #1a3a6e 0%, #3b5fa4 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center", boxSizing: "border-box" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💊</div>

      {state === "chargement" && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>Chargement…</div>}

      {state === "erreur" && (
        <div style={{ color: "#fff" }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Lien invalide ou expiré</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>{error}</div>
        </div>
      )}

      {state === "pret" && info && (
        <div style={{ width: "100%", maxWidth: 340 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 10, lineHeight: 1.3 }}>
            Bonjour {info.patientPrenom} 👋
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 28 }}>
            Votre renouvellement d'ordonnance chez <strong>{info.pharmacieNom}</strong> est prévu prochainement. Que souhaitez-vous faire ?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CHOIX.map(c => (
              <button key={c.key} onClick={() => choisir(c.key)}
                style={{
                  padding: "14px 18px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{c.emoji}</span>
                <span style={{ minWidth: 0, flex: "1 1 auto", overflowWrap: "break-word" }}>
                  <div>{c.label}</div>
                  {c.sub && <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{c.sub}</div>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state === "creneau" && (
        <div style={{ width: "100%", maxWidth: 340 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 10, lineHeight: 1.3 }}>
            Quand pouvez-vous passer ? 🕐
          </div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, marginBottom: 28 }}>
            Ça aide votre pharmacien à préparer votre commande à l'avance.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CRENEAUX.map(c => (
              <button key={c.key} onClick={() => envoyer(choixEnCours, c.key)}
                style={{
                  padding: "14px 18px", borderRadius: 14, border: "2px solid rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{c.emoji}</span>
                <span style={{ minWidth: 0, flex: "1 1 auto", overflowWrap: "break-word" }}>{c.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => envoyer(choixEnCours, null)}
            style={{ marginTop: 16, background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
            Je ne sais pas encore
          </button>
        </div>
      )}

      {state === "envoi" && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>Envoi…</div>}

      {state === "merci" && (
        <div style={{ color: "#fff" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Merci !</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", maxWidth: 300 }}>
            Votre pharmacie a bien été informée de votre choix.
          </div>
        </div>
      )}
    </div>
  );
}

export { RappelChoixPage };
