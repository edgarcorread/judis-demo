import { BrowserWindow, screen, shell } from 'electron'
import path from 'path'

export let companionWin: BrowserWindow | null = null
export let overlayWin: BrowserWindow | null = null
export let islandWin: BrowserWindow | null = null
export let workspaceWin: BrowserWindow | null = null

const DEV_URL = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']

// Ventana del mini companion: el orbe vive en la esquina superior-izquierda
// y la burbuja de respuesta se despliega debajo de él.
const MINI_WIDTH = 360
const MINI_HEIGHT = 280
const CURSOR_OFFSET = 22

let followTimer: ReturnType<typeof setInterval> | null = null
let lastX = -1
let lastY = -1
let lastFlipH = false
let lastFlipV = false

function rendererUrl(page: 'companion' | 'overlay' | 'island' | 'mem'): string {
  if (DEV_URL) {
    const base = DEV_URL.endsWith('/') ? DEV_URL : `${DEV_URL}/`
    return `${base}src/${page}/index.html`
  }
  return path.join(__dirname, `../renderer/src/${page}/index.html`)
}

function loadRenderer(win: BrowserWindow, page: 'companion' | 'overlay' | 'island' | 'mem'): void {
  if (DEV_URL) {
    win.loadURL(rendererUrl(page))
  } else {
    win.loadFile(rendererUrl(page))
  }
}

function pipeConsole(win: BrowserWindow, tag: string): void {
  win.webContents.on('console-message', (_e, level, message) => {
    const lvl = level >= 3 ? 'ERROR' : level === 2 ? 'WARN' : 'LOG'
    console.log(`[${tag}:${lvl}] ${message}`)
  })
}

function positionMini(): void {
  if (!companionWin || companionWin.isDestroyed()) return

  const pt = screen.getCursorScreenPoint()
  if (pt.x === lastX && pt.y === lastY) return
  lastX = pt.x
  lastY = pt.y

  const { workArea } = screen.getDisplayNearestPoint(pt)
  let x = pt.x + CURSOR_OFFSET
  let y = pt.y + CURSOR_OFFSET
  // Si no cabe hacia abajo/derecha, voltear hacia el otro lado del cursor.
  // El renderer espeja el layout (flip-h/flip-v) para que el orbe quede pegado al cursor.
  const flipH = x + MINI_WIDTH > workArea.x + workArea.width
  const flipV = y + MINI_HEIGHT > workArea.y + workArea.height
  if (flipH) x = pt.x - MINI_WIDTH - CURSOR_OFFSET
  if (flipV) y = pt.y - MINI_HEIGHT - CURSOR_OFFSET

  if (flipH !== lastFlipH || flipV !== lastFlipV) {
    lastFlipH = flipH
    lastFlipV = flipV
    companionWin.webContents.send('capaz:flip', { h: flipH, v: flipV })
  }

  companionWin.setPosition(Math.round(x), Math.round(y), false)
}

/** Mueve el overlay de hotspots a la pantalla capturada (multi-monitor). */
export function moveOverlayToDisplay(bounds: Electron.Rectangle): void {
  if (!overlayWin || overlayWin.isDestroyed()) return
  const cur = overlayWin.getBounds()
  if (cur.x === bounds.x && cur.y === bounds.y && cur.width === bounds.width && cur.height === bounds.height) return
  overlayWin.setBounds(bounds)
}

function startFollowing(): void {
  if (followTimer) return
  followTimer = setInterval(positionMini, 16)
}

export function createCompanionWindow(preloadPath: string): BrowserWindow {
  companionWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  companionWin.setAlwaysOnTop(true, 'screen-saver')
  companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Excluir de la captura de pantalla: Claude no debe ver el orbe
  companionWin.setContentProtection(true)
  companionWin.setIgnoreMouseEvents(true, { forward: true })

  companionWin.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  loadRenderer(companionWin, 'companion')

  companionWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[capaz] Companion falló al cargar: ${code} ${desc} — ${url}`)
  })

  pipeConsole(companionWin, 'companion')

  companionWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  startFollowing()

  return companionWin
}

// ── Isla superior (consola de enseñanza) ──────────────
const ISLAND_COLLAPSED = { width: 200, height: 40 }
const ISLAND_EXPANDED = { width: 460, height: 440 }

function islandBounds(size: { width: number; height: number }): Electron.Rectangle {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: workArea.y + 8,
    width: size.width,
    height: size.height
  }
}

export function setIslandExpanded(expanded: boolean): void {
  if (!islandWin || islandWin.isDestroyed()) return
  islandWin.setBounds(islandBounds(expanded ? ISLAND_EXPANDED : ISLAND_COLLAPSED))
}

export function createIslandWindow(preloadPath: string): BrowserWindow {
  islandWin = new BrowserWindow({
    ...islandBounds(ISLAND_COLLAPSED),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  islandWin.setAlwaysOnTop(true, 'floating')
  islandWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Excluir de la captura: la isla no debe aparecer en lo que ve Claude
  islandWin.setContentProtection(true)

  pipeConsole(islandWin, 'island')
  loadRenderer(islandWin, 'island')

  return islandWin
}

export function createOverlayWindow(preloadPath: string): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()

  overlayWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Excluir de la captura: los hotspots no deben contaminar el siguiente screenshot
  overlayWin.setContentProtection(true)

  pipeConsole(overlayWin, 'overlay')
  loadRenderer(overlayWin, 'overlay')

  return overlayWin
}

export function createWorkspaceWindow(preloadPath: string): BrowserWindow {
  workspaceWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Mem Workspace & LucIA',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  workspaceWin.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  pipeConsole(workspaceWin, 'workspace')
  loadRenderer(workspaceWin, 'mem')

  workspaceWin.on('closed', () => {
    workspaceWin = null
  })

  return workspaceWin
}
