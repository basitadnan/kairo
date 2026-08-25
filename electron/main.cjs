const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let win = null
let tray = null
let quitting = false

// Single instance: launching the exe twice just reveals the running app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  function createWindow() {
    win = new BrowserWindow({
      width: 1240,
      height: 800,
      minWidth: 940,
      minHeight: 600,
      autoHideMenuBar: true,
      backgroundColor: '#F7F6F3',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      title: 'Kairo',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    if (process.env.ELECTRON_DEV) {
      win.loadURL('http://localhost:5173')
    } else {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }

    // Closing the window keeps the app alive in the tray so reminders still fire.
    win.on('close', (e) => {
      if (!quitting) {
        e.preventDefault()
        win.hide()
      }
    })
  }

  function createTray() {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'))
    tray = new Tray(icon)
    tray.setToolTip('Kairo')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Kairo', click: () => showWindow() },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          },
        },
      ]),
    )
    tray.on('click', () => showWindow())
  }

  function showWindow() {
    if (!win || win.isDestroyed()) {
      createWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  app.whenReady().then(() => {
    createWindow()
    createTray()

    app.on('activate', () => {
      // macOS convention; harmless on Windows.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  // Tray keeps the process alive when the last window closes.
  app.on('window-all-closed', (e) => {
    // no-op: stay resident
  })

  app.on('before-quit', () => {
    quitting = true
  })
}
