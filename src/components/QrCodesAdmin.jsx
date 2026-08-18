// ─── Backoffice : QR codes pré-imprimés (18/08/2026) ──────────────────────────
// Génération de lots (planche à imprimer) + association manuelle par le
// staff au moment de l'envoi postal du goodie — voir le plan approuvé pour
// le contexte complet. Conventions identiques à PricingEditor.jsx/
// StoriesContentAdmin.jsx (callSecureData local, styles inline, palette
// sombre #0f172a/#1e293b/#334155).
import { useState, useEffect } from "react";
import { openQrSheetPDF } from "../lib/print.jsx";

function QrCodesAdmin({ adminToken } = {}) {
  const [count, setCount] = useState(100);
  const [batchLabel, setBatchLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [genErr, setGenErr] = useState("");

  const [pharmacies, setPharmacies] = useState([]);
  const [pharmaSearch, setPharmaSearch] = useState("");
  const [selectedPharmacie, setSelectedPharmacie] = useState(null);
  const [assignCode, setAssignCode] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");
  const [assignErr, setAssignErr] = useState("");

  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listStatus, setListStatus] = useState("");
  const [listSearch, setListSearch] = useState("");

  async function callSecureData(resource, params) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${adminToken || ""}` },
      body: JSON.stringify({ resource, params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
    return body;
  }

  async function loadList() {
    setListLoading(true);
    try {
      const { data } = await callSecureData("admin_qrcodes_list", { status: listStatus || undefined, search: listSearch || undefined });
      setList(data || []);
    } catch (e) {
      console.error("[QrCodesAdmin] loadList", e.message);
    }
    setListLoading(false);
  }

  useEffect(() => {
    loadList();
    callSecureData("admin_pharmacies").then(({ data }) => setPharmacies(data || [])).catch(() => {});
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadList(); }, [listStatus]);

  async function handleGenerate() {
    setGenerating(true); setGenErr(""); setGenMsg("");
    try {
      const n = Number(count);
      if (!n || n < 1 || n > 2000) throw new Error("Nombre invalide (1 à 2000)");
      const { data } = await callSecureData("admin_qrcodes_generate", { count: n, batchLabel: batchLabel || undefined });
      setGenMsg(`✅ ${data.length} code(s) généré(s) — ouverture de la planche…`);
      await openQrSheetPDF(data, batchLabel);
      loadList();
    } catch (e) {
      setGenErr("Échec : " + e.message);
    }
    setGenerating(false);
  }

  async function handleAssign() {
    setAssigning(true); setAssignErr(""); setAssignMsg("");
    try {
      if (!assignCode.trim()) throw new Error("Code requis");
      if (!selectedPharmacie) throw new Error("Choisissez une pharmacie");
      await callSecureData("admin_qrcodes_assign", { code: assignCode.trim(), pharmacieId: selectedPharmacie.id });
      setAssignMsg(`✅ ${assignCode.trim().toUpperCase()} associé à ${selectedPharmacie.nom}`);
      setAssignCode(""); setSelectedPharmacie(null); setPharmaSearch("");
      loadList();
    } catch (e) {
      setAssignErr("Échec : " + e.message);
    }
    setAssigning(false);
  }

  const filteredPharmacies = pharmaSearch
    ? pharmacies.filter(p =>
        p.nom?.toLowerCase().includes(pharmaSearch.toLowerCase()) ||
        p.email?.toLowerCase().includes(pharmaSearch.toLowerCase()))
    : [];

  const cardStyle = { background: "#1e293b", borderRadius: 14, padding: 20, border: "1px solid #334155" };
  const inputStyle = { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none" };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>QR codes pré-imprimés</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Génération de lots, planche à imprimer, association aux pharmacies à l'envoi</div>
      </div>

      {/* ── Générer un lot ────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 14 }}>🖨️ Générer un lot</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Nombre de codes</label>
            <input type="number" min="1" max="2000" value={count} onChange={e => setCount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={labelStyle}>Libellé du lot (optionnel)</label>
            <input value={batchLabel} onChange={e => setBatchLabel(e.target.value)} placeholder="ex. Lot rentrée 2026" style={{ ...inputStyle, width: "100%" }} />
          </div>
          <button onClick={handleGenerate} disabled={generating}
            style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 800, fontSize: 13, cursor: generating ? "default" : "pointer", fontFamily: "inherit", opacity: generating ? 0.6 : 1 }}>
            {generating ? "Génération…" : "🖨️ Générer + ouvrir la planche"}
          </button>
        </div>
        {genMsg && <div style={{ marginTop: 12, color: "#86efac", fontSize: 12 }}>{genMsg}</div>}
        {genErr && <div style={{ marginTop: 12, background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12 }}>{genErr}</div>}
      </div>

      {/* ── Associer un goodie envoyé ─────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 4 }}>📦 Associer un goodie envoyé</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Au moment d'envoyer le goodie : tapez le code lu sur l'objet physique, choisissez la pharmacie destinataire.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Code du sticker</label>
            <input value={assignCode} onChange={e => setAssignCode(e.target.value)} placeholder="ex. QR-4F82K9" style={{ ...inputStyle, width: 160, fontFamily: "monospace" }} />
          </div>
          <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
            <label style={labelStyle}>Pharmacie destinataire</label>
            {selectedPharmacie ? (
              <div style={{ ...inputStyle, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{selectedPharmacie.nom} <span style={{ color: "#64748b" }}>({selectedPharmacie.email})</span></span>
                <button onClick={() => setSelectedPharmacie(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <>
                <input value={pharmaSearch} onChange={e => setPharmaSearch(e.target.value)} placeholder="🔍 Rechercher pharmacie ou email…" style={{ ...inputStyle, width: "100%" }} />
                {filteredPharmacies.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0f172a", border: "1px solid #334155", borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto", zIndex: 10 }}>
                    {filteredPharmacies.slice(0, 20).map(p => (
                      <div key={p.id} onClick={() => { setSelectedPharmacie(p); setPharmaSearch(""); }}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#e2e8f0", borderBottom: "1px solid #1e293b" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        {p.nom} <span style={{ color: "#64748b", fontSize: 11 }}>({p.email})</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <button onClick={handleAssign} disabled={assigning}
            style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#15803d", color: "#fff", fontWeight: 800, fontSize: 13, cursor: assigning ? "default" : "pointer", fontFamily: "inherit", opacity: assigning ? 0.6 : 1 }}>
            {assigning ? "Association…" : "✓ Associer"}
          </button>
        </div>
        {assignMsg && <div style={{ marginTop: 12, color: "#86efac", fontSize: 12 }}>{assignMsg}</div>}
        {assignErr && <div style={{ marginTop: 12, background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12 }}>{assignErr}</div>}
      </div>

      {/* ── Recherche / liste ─────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 14 }}>🔍 Rechercher un code</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadList()}
            placeholder="🔍 Code ou pharmacie…" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
          {[["", "Tous"], ["genere", "En stock"], ["attribue", "Attribués"]].map(([k, l]) => (
            <button key={k} onClick={() => setListStatus(k)}
              style={{ padding: "8px 14px", border: `1px solid ${listStatus === k ? "#3b82f6" : "#334155"}`, borderRadius: 8, background: listStatus === k ? "#3b82f6" : "transparent", color: listStatus === k ? "#fff" : "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
          <button onClick={loadList} style={{ padding: "8px 14px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
        </div>
        {listLoading ? (
          <div style={{ color: "#64748b", fontSize: 13, padding: 20, textAlign: "center" }}>Chargement…</div>
        ) : list.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13, padding: 20, textAlign: "center" }}>Aucun résultat</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 11 }}>Code</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 11 }}>Statut</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 11 }}>Pharmacie</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 11 }}>Lot</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 11 }}>Généré le</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #1e293b" }}>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#e2e8f0" }}>{r.code}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: r.status === "attribue" ? "#14532d" : "#334155", color: r.status === "attribue" ? "#86efac" : "#94a3b8" }}>
                        {r.status === "attribue" ? "Attribué" : "En stock"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#e2e8f0" }}>{r.pharmacies ? `${r.pharmacies.nom} (${r.pharmacies.email})` : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#64748b" }}>{r.batch_label || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#64748b" }}>{new Date(r.created_at).toLocaleDateString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { QrCodesAdmin };
export default QrCodesAdmin;
