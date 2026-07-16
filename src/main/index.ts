import { app, BrowserWindow, systemPreferences, dialog } from 'electron'
import { config } from 'dotenv'
import path from 'path'
import { createCompanionWindow, createOverlayWindow, createIslandWindow, createWorkspaceWindow } from './windows'
import { registerHotkey, unregisterAll } from './hotkey'
import { registerIpcHandlers, handleHotkeyDown, handleHotkeyUp, handleGlobalClick } from './ipc'

config()

async function checkPermissions(): Promise<void> {
  const micStatus = systemPreferences.getMediaAccessStatus('microphone')
  if (micStatus !== 'granted') {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    if (!granted) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Capaz — Permiso requerido',
        message: 'Capaz necesita acceso al micrófono para funcionar.',
        detail: 'Ve a Preferencias del Sistema → Privacidad y Seguridad → Micrófono y activa Capaz.'
      })
    }
  }

  const screenStatus = systemPreferences.getMediaAccessStatus('screen')
  if (screenStatus !== 'granted') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Capaz — Permiso de pantalla',
      message: 'Capaz necesita permiso de Grabación de Pantalla.',
      detail: 'Ve a Preferencias del Sistema → Privacidad y Seguridad → Grabación de Pantalla y activa Capaz (o Terminal).\n\nReinicia la app después de conceder el permiso.'
    })
  }
}

app.whenReady().then(async () => {
  await checkPermissions()

  const preloadPath = path.join(__dirname, '../preload/index.js')

  createCompanionWindow(preloadPath)
  createOverlayWindow(preloadPath)
  createIslandWindow(preloadPath)
  createWorkspaceWindow(preloadPath)

  registerIpcHandlers()
  registerHotkey(handleHotkeyDown, handleHotkeyUp, handleGlobalClick)
})

app.on('will-quit', () => {
  unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const preloadPath = path.join(__dirname, '../preload/index.js')
    createCompanionWindow(preloadPath)
    createOverlayWindow(preloadPath)
    createIslandWindow(preloadPath)
    createWorkspaceWindow(preloadPath)
  }
})
