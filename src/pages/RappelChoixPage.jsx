// Page publique patient d'un rappel de renouvellement d'ordonnance (04/09/2026)
// — lien reçu par SMS (?rappel=<token>), voir App.jsx et
// supabase/functions/resolve-rappel/index.ts. Strictement anonyme, aucune
// dépendance à PatientPage.jsx (pas de code personnel, pas de story carousel).
import { useState, useEffect, useCallback } from "react";

const CHOIX = [
  { key: "tout_renouveler", emoji: "✅", label: "Tout renouveler" },
  { key: "rien", emoji: "🚫", label: "Ne rien prendre" },
  { key: "partiel", emoji: "🔶", label: "Renouvellement partiel", sub: "Nous vous contacterons pour préciser" },
];

// Créneau de retrait (08/09/2026) — demandé uniquement si le patient vient
// chercher quelque chose (pas pour "rien"). Indication large plutôt qu'un
// horaire précis — voir migration 20260908_rappels_creneau_retrait.sql.
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

  // Tailles agrandies (08/09/2026, retour direct) — un patient qui répond à
  // ce lien SMS n'est pas forcément à l'aise avec un petit texte sur mobile ;
  // le public visé inclut des personnes âgées. Boutons pleine largeur, gros
  // texte, gros émojis plutôt qu'une mise en page compacte.
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "linear-gradient(160deg, #1a3a6e 0%, #3b5fa4 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", textAlign: "center", boxSizing: "border-box" }}>
      <div style={{ fontSize: 60, marginBottom: 20 }}>💊</div>

      {state === "chargement" && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 19 }}>Chargement…</div>}

      {state === "erreur" && (
        <div style={{ color: "#fff" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Lien invalide ou expiré</div>
          <div style={{ fontSize: 17, color: "rgba(255,255,255,0.75)" }}>{error}</div>
        </div>
      )}

      {state === "pret" && info && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 14, lineHeight: 1.3 }}>
            Bonjour {info.patientPrenom} 👋
          </div>
          <div style={{ fontSize: 19, color: "rgba(255,255,255,0.9)", lineHeight: 1.6, marginBottom: 32 }}>
            Votre renouvellement d'ordonnance chez <strong>{info.pharmacieNom}</strong> est prévu prochainement. Que souhaitez-vous faire ?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CHOIX.map(c => (
              <button key={c.key} onClick={() => choisir(c.key)}
                style={{
                  padding: "22px 22px", borderRadius: 18, border: "2.5px solid rgba(255,255,255,0.45)",
                  background: "rgba(255,255,255,0.14)", color: "#fff", fontWeight: 800, fontSize: 20,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                }}>
                <span style={{ fontSize: 30, flexShrink: 0 }}>{c.emoji}</span>
                <span>
                  <div>{c.label}</div>
                  {c.sub && <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{c.sub}</div>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {state === "creneau" && (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 14, lineHeight: 1.3 }}>
            Quand pouvez-vous passer ? 🕐
          </div>
          <div style={{ fontSize: 19, color: "rgba(255,255,255,0.9)", lineHeight: 1.6, marginBottom: 32 }}>
            Ça aide votre pharmacien à préparer votre commande à l'avance.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CRENEAUX.map(c => (
              <button key={c.key} onClick={() => envoyer(choixEnCours, c.key)}
                style={{
                  padding: "22px 22px", borderRadius: 18, border: "2.5px solid rgba(255,255,255,0.45)",
                  background: "rgba(255,255,255,0.14)", color: "#fff", fontWeight: 800, fontSize: 20,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                }}>
                <span style={{ fontSize: 30, flexShrink: 0 }}>{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => envoyer(choixEnCours, null)}
            style={{ marginTop: 22, padding: "10px", background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 17, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
            Je ne sais pas encore
          </button>
        </div>
      )}

      {state === "envoi" && <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 19 }}>Envoi…</div>}

      {state === "merci" && (
        <div style={{ color: "#fff" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🙏</div>
          <div style={{ fontSize: 25, fontWeight: 800, marginBottom: 10 }}>Merci !</div>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.85)", maxWidth: 340, lineHeight: 1.5 }}>
            Votre pharmacie a bien été informée de votre choix.
          </div>
        </div>
      )}
    </div>
  );
}

export { RappelChoixPage };
