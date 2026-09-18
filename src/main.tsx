import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/newsreader'
import './styles/globals.css'

import App from './App'
import { AuthScreen } from './screens/AuthScreen'
import { bootAuth, useAuth } from './lib/auth'
import { startAutoSync } from './lib/sync'
import { startNotificationEngine } from './lib/notifications'
import { startWidgetSync } from './lib/widget'

function Root() {
  const phase = useAuth((s) => s.phase)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    void bootAuth().finally(() => setBooted(true))
  }, [])

  if (!booted) {
    return <div className="min-h-dvh bg-canvas" aria-busy="true" />
  }
  if (phase === 'gate') {
    return <AuthScreen />
  }
  return (
    <HashRouter>
      <App />
    </HashRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

// Engines start after the auth decision: a claim-mode device still on the
// gate shouldn't push its rows anywhere until the user has chosen what this
// device's data belongs to.
void Promise.resolve().then(startEngines)

function startEngines() {
  startAutoSync()
  startNotificationEngine()
  startWidgetSync()
}
