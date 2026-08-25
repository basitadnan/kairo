import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'


import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/newsreader'
import './styles/globals.css'

import App from './App'
import { AccessGate } from './screens/AccessGate'
import { gateRequired, hasAccount, isUnlocked, readAccount, unlock } from './lib/access'
import { startAutoSync } from './lib/sync'
import { startNotificationEngine } from './lib/notifications'
import { startWidgetSync } from './lib/widget'

startAutoSync()
startNotificationEngine()
startWidgetSync()

/** Hosted-web preview gate: native + local file runs open straight in. */
function GatedRoot() {
  const needsGate = gateRequired() && (!hasAccount() || !isUnlocked())
  const [locked, setLocked] = useState(needsGate)

  if (locked) {
    return <AccessGate account={readAccount()} onUnlock={() => { unlock(); setLocked(false) }} />
  }
  return (
    <HashRouter>
      <App />
    </HashRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GatedRoot />
  </React.StrictMode>,
)

