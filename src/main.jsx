import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring.js'
import { loadPlanLimits } from './lib/plans.js'

initMonitoring() // no-op tant que VITE_SENTRY_DSN n'est pas défini

// Attendu avant le premier rendu : PLAN_LIMITS est un objet muté en place, lu
// de façon synchrone au rendu par de nombreux composants (landing, checkout,
// dashboard) — le recharger APRÈS le montage ne les ferait pas se re-rendre.
// Timeout court : un réseau lent ne doit pas retarder indéfiniment l'affichage,
// on retombe alors sur les valeurs par défaut de plans.js.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))])
}

withTimeout(loadPlanLimits(), 2000).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
