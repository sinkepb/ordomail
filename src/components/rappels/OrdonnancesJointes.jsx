// Ordonnances jointes à un rappel (08/11/2026, demande titulaire) — liste avec
// voir / retirer / ajouter, utilisée dans "Modifier le rappel" (RappelForm) et,
// en lecture seule, dans le sélecteur de la liste quand un rappel en a
// plusieurs (RappelsSection). Les actions (ajout, retrait) s'appliquent tout de
// suite côté serveur, indépendamment du bouton "Enregistrer" du formulaire :
// ce sont des opérations sur des fichiers, pas des champs du rappel.
import { useState } from "react";

const BTN = { padding: "4px 9px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 };

export function OrdonnancesJointes({ fichiers = [], onView, onAdd, onRemove, busy = false, error = "", readOnly = false }) {
  // Confirmation inline avant un retrait : retirer une ordonnance ajoutée à la
  // main supprime aussi son fichier, pas seulement le lien.
  const [confirmId, setConfirmId] = useState(null);

  return (
    <div>
      {fichiers.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#94a3b8", fontStyle: "italic", marginBottom: 8 }}>Aucune ordonnance jointe.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {fichiers.map((f, i) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {f.type === "pdf" ? "📄" : "🖼️"} {f.name && f.name !== "ordonnance" ? f.name : `Ordonnance ${i + 1}`}
            </span>
            {confirmId === f.id ? (
              <>
                <span style={{ fontSize: 11.5, color: "#b91c1c" }}>Retirer ?</span>
                <button type="button" disabled={busy} onClick={() => { setConfirmId(null); onRemove(f); }}
                  style={{ ...BTN, border: "none", background: "#dc2626", color: "#fff" }}>Oui</button>
                <button type="button" disabled={busy} onClick={() => setConfirmId(null)}
                  style={{ ...BTN, border: "1px solid #e2e8f0", background: "#fff", color: "#475569" }}>Non</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onView(f)} title="Voir l'ordonnance"
                  style={{ ...BTN, border: "1px solid #c7d2fe", background: "#f0f4ff", color: "#4338ca" }}>👁</button>
                {!readOnly && (
                  <button type="button" disabled={busy} onClick={() => setConfirmId(f.id)} title="Retirer cette ordonnance"
                    style={{ ...BTN, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", opacity: busy ? 0.6 : 1 }}>🗑️</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1.5px dashed #c7d2fe", background: "#f8fafc", color: "#1a3a6e", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "⏳ Envoi en cours…" : "➕ Ajouter une ou plusieurs ordonnances"}
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif" disabled={busy} style={{ display: "none" }}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) onAdd(files);
            }} />
        </label>
      )}
      {!readOnly && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>JPG, PNG, PDF ou TIFF — 15 Mo maximum par fichier.</div>}
      {error && <div style={{ color: "#dc2626", fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
