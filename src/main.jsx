import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring.js'

initMonitoring() // no-op tant que VITE_SENTRY_DSN n'est pas défini

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
