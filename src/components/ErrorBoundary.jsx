// Error boundary réutilisable (13/08/2026) — extrait de App.jsx, comportement
// plein écran inchangé (voir git log pour la version d'origine).
//
// App.jsx n'en posait qu'un seul, tout en haut de l'arbre : un crash de rendu
// n'importe où (ex: un onglet de ParametresTab) blanchissait toute
// l'application, y compris les écrans qui n'ont rien à voir avec le bug. Ce
// composant est posé une seconde fois, en mode `compact`, autour de chaque
// section indépendante du dashboard (voir Dashboard.jsx) — le crash reste
// contenu à sa carte, le reste de l'appli continue de fonctionner.
import React from "react";
import { reportError } from "../lib/monitoring.js";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.label ? " " + this.props.label : ""}]`, error, info);
    reportError(error, { componentStack: info?.componentStack, boundary: this.props.label }); // no-op sans VITE_SENTRY_DSN
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      if (this.props.compact) {
        return (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
            padding: 20, margin: 16, fontFamily: "'Inter',system-ui,sans-serif",
          }}>
            <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: 14, marginBottom: 6 }}>
              ⚠️ {this.props.label || "Cette section"} a rencontré une erreur
            </div>
            <div style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 12 }}>
              Le reste de l'application continue de fonctionner normalement.
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              style={{
                border: "none", borderRadius: 8, background: "#b91c1c", color: "#fff",
                padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>
              Réessayer
            </button>
          </div>
        );
      }
      return (
        <div style={{
          minHeight: "100vh", background: "#0f172a",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, fontFamily: "monospace"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <div style={{ color: "#f87171", fontWeight: 900, fontSize: 20, marginBottom: 12 }}>
            Erreur OrdoMail
          </div>
          <div style={{
            background: "#1e293b", border: "1px solid #f87171",
            borderRadius: 12, padding: 20, maxWidth: 700, width: "100%",
            marginBottom: 16
          }}>
            <div style={{ color: "#fca5a5", fontSize: 14, marginBottom: 8, fontWeight: 700 }}>
              {this.state.error?.name}: {this.state.error?.message}
            </div>
            <pre style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 300 }}>
              {this.state.error?.stack}
            </pre>
          </div>
          {this.state.info && (
            <div style={{
              background: "#1e293b", border: "1px solid #334155",
              borderRadius: 12, padding: 20, maxWidth: 700, width: "100%",
              marginBottom: 16
            }}>
              <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Component Stack:</div>
              <pre style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 200 }}>
                {this.state.info.componentStack}
              </pre>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#3b82f6", color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 24px", fontSize: 14,
              fontWeight: 700, cursor: "pointer", fontFamily: "monospace"
            }}>
            🔄 Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;
