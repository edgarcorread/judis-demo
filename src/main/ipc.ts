import { ipcMain, desktopCapturer, screen, dialog, shell } from 'electron'
import { companionWin, overlayWin, workspaceWin, moveOverlayToDisplay, setIslandExpanded } from './windows'
import { transcribeAudio, askClaude } from '../services/ai'
import type { ChatMessage } from '../services/ai'
import { listFlows, deleteFlow, importFlow, flowPath, flowsSystemContext } from './flows'

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Screenshot {
  jpeg: Buffer
  imgWidth: number
  imgHeight: number
  screenWidth: number
  screenHeight: number
  displayX: number
  displayY: number
}

interface ActiveHotspot {
  id: number
  x: number // coordenadas globales (para detectar el click)
  y: number
  label?: string
}

let appState: AppState = 'idle'
let capazInPage = false
let pendingScreenshot: Promise<Screenshot> | null = null
let stopWatchdog: ReturnType<typeof setTimeout> | null = null
let activeHotspots: ActiveHotspot[] = []
let hotspotSeq = 0

// ── Modo guía ──────────────────────────────────────────
let flowActive = false
let flowSteps = 0
let history: ChatMessage[] = []
const MAX_FLOW_STEPS = 15
// Espera tras el click antes de re-capturar: da tiempo a que cargue la pantalla nueva
const ADVANCE_DELAY = 1_800
const ADVANCE_PROMPT =
  'El aprendiz hizo click donde señalaste. Esta es la pantalla actual. ' +
  'Verifica que sea la esperada y dicta el siguiente paso, corrige si algo no salió bien, ' +
  'o marca guide.done si el objetivo ya se cumplió.'

// Radio de acierto generoso: absorbe el pequeño desfase con que apunta el modelo
const HIT_RADIUS = 40

function setState(state: AppState): void {
  appState = state

  if (state === 'idle') {
    activeHotspots = []
    overlayWin?.webContents.send('capaz:hotspots', [])
    workspaceWin?.webContents.send('capaz:hotspots', [])
  }

  companionWin?.webContents.send('capaz:state', state)
  workspaceWin?.webContents.send('capaz:state', state)
}

function resetFlow(): void {
  flowActive = false
  flowSteps = 0
  history = []
}

async function captureScreenshot(): Promise<Screenshot> {
  if (capazInPage && workspaceWin && !workspaceWin.isDestroyed()) {
    const image = await workspaceWin.capturePage()
    const finalSize = image.getSize()
    const bounds = workspaceWin.getBounds()

    const MAX = 1568
    let finalImage = image
    if (finalSize.width > MAX || finalSize.height > MAX) {
      if (finalSize.width >= finalSize.height) {
        finalImage = image.resize({ width: MAX, quality: 'good' })
      } else {
        finalImage = image.resize({ height: MAX, quality: 'good' })
      }
    }
    const resizedSize = finalImage.getSize()
    return {
      jpeg: finalImage.toJPEG(85),
      imgWidth: resizedSize.width,
      imgHeight: resizedSize.height,
      screenWidth: bounds.width,
      screenHeight: bounds.height,
      displayX: bounds.x,
      displayY: bounds.y
    }
  }

  // Capturar la pantalla donde está el cursor (soporte multi-monitor)
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width, height } = display.size
  const scaleFactor = display.scaleFactor

  const physWidth = Math.round(width * scaleFactor)
  const physHeight = Math.round(height * scaleFactor)

  console.log(`[capaz] Pantalla ${display.id}: ${width}x${height} @${scaleFactor}x → físico ${physWidth}x${physHeight}`)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: physWidth, height: physHeight }
  })

  if (!sources.length) throw new Error('No se encontró fuente de pantalla. ¿Tienes permiso de grabación?')

  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  const thumbnail = source.thumbnail
  const capturedSize = thumbnail.getSize()
  console.log(`[capaz] Captura obtenida: ${capturedSize.width}x${capturedSize.height}`)

  const MAX = 1568
  let finalImage = thumbnail
  if (capturedSize.width > MAX || capturedSize.height > MAX) {
    if (capturedSize.width >= capturedSize.height) {
      finalImage = thumbnail.resize({ width: MAX, quality: 'good' })
    } else {
      finalImage = thumbnail.resize({ height: MAX, quality: 'good' })
    }
    const resizedSize = finalImage.getSize()
    console.log(`[capaz] Reescalado a: ${resizedSize.width}x${resizedSize.height}`)
  }

  // Mover el overlay de hotspots a esta pantalla
  moveOverlayToDisplay(display.bounds)

  const finalSize = finalImage.getSize()
  return {
    jpeg: finalImage.toJPEG(85),
    imgWidth: finalSize.width,
    imgHeight: finalSize.height,
    screenWidth: width,
    screenHeight: height,
    displayX: display.bounds.x,
    displayY: display.bounds.y
  }
}

/** Un turno completo con Claude: pregunta de voz o avance automático de la guía. */
async function processTurn(text: string, shot: Screenshot): Promise<void> {
  const result = await askClaude({
    history,
    question: text,
    screenshotJpeg: shot.jpeg,
    imgWidth: shot.imgWidth,
    imgHeight: shot.imgHeight,
    extraSystem: flowsSystemContext()
  })
  console.log(`[capaz] Respuesta (${result.tokensIn}→${result.tokensOut} tokens): "${result.answer}"`)

  if (result.guide.active && !result.guide.done) {
    if (!flowActive) {
      flowActive = true
      flowSteps = 0
      console.log('[capaz] 🧭 Guía iniciada')
    }
    history.push(result.userMessage, result.assistantMessage)
  } else {
    if (flowActive && result.guide.done) console.log('[capaz] 🎉 Guía completada')
    resetFlow()
  }

  // Mapear hotspots: captura → local a la pantalla (overlay) y global (detección de click)
  const overlaySpots = result.hotspots.map((h) => {
    const localX = Math.round((h.x * shot.screenWidth) / shot.imgWidth)
    const localY = Math.round((h.y * shot.screenHeight) / shot.imgHeight)
    return { id: ++hotspotSeq, x: localX, y: localY, label: h.label }
  })
  activeHotspots = overlaySpots.map((s) => ({
    id: s.id,
    x: shot.displayX + s.x,
    y: shot.displayY + s.y,
    label: s.label
  }))

  setState('speaking')

  if (overlaySpots.length) {
    console.log(`[capaz] Hotspots: ${JSON.stringify(activeHotspots)}`)
    overlayWin?.webContents.send('capaz:hotspots', overlaySpots)
    workspaceWin?.webContents.send('capaz:hotspots', overlaySpots)
  }

  companionWin?.webContents.send('capaz:answer', {
    answer: result.answer,
    question: text,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    flow: flowActive
  })
  workspaceWin?.webContents.send('capaz:answer', {
    answer: result.answer,
    question: text,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    flow: flowActive
  })

  if (result.guide.done) {
    // Dejar leer el mensaje de cierre y volver a idle
    setTimeout(() => {
      if (appState === 'speaking' && !flowActive) setState('idle')
    }, 20_000)
  }
}

/** Tras un click en el hotspot de la guía: esperar a que cargue la pantalla y pedir el siguiente paso. */
function advanceFlow(): void {
  flowSteps++
  if (flowSteps > MAX_FLOW_STEPS) {
    console.error('[capaz] La guía excedió el máximo de pasos — cancelando')
    resetFlow()
    setState('idle')
    companionWin?.webContents.send('capaz:error', 'La guía se hizo muy larga y se canceló.')
    workspaceWin?.webContents.send('capaz:error', 'La guía se hizo muy larga y se canceló.')
    return
  }

  setTimeout(async () => {
    // Si el usuario canceló o está hablando, su turno de voz continúa la guía
    if (!flowActive || appState === 'listening') return
    try {
      setState('thinking')
      const shot = await captureScreenshot()
      await processTurn(ADVANCE_PROMPT, shot)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[capaz] Error avanzando la guía:', msg)
      resetFlow()
      setState('idle')
      companionWin?.webContents.send('capaz:error', msg)
      workspaceWin?.webContents.send('capaz:error', msg)
    }
  }, ADVANCE_DELAY)
}

export function registerIpcHandlers(): void {
  ipcMain.handle('capaz:audio', async (_event, payload: ArrayBuffer | { text: string }) => {
    if (appState !== 'listening') return

    if (stopWatchdog) { clearTimeout(stopWatchdog); stopWatchdog = null }

    try {
      setState('thinking')

      const screenshotPromise = pendingScreenshot
      pendingScreenshot = null

      if (!screenshotPromise) throw new Error('No hay screenshot disponible')
      const shot = await screenshotPromise

      let transcript = ''
      if (payload && typeof payload === 'object' && 'text' in payload) {
        transcript = (payload as { text: string }).text
        console.log(`[capaz] Texto recibido de reconocimiento de voz local: "${transcript}"`)
      } else {
        const nodeBuffer = Buffer.from(payload as ArrayBuffer)
        console.log(`[capaz] Audio recibido para transcripción en servidor: ${nodeBuffer.length} bytes`)
        transcript = await transcribeAudio(nodeBuffer)
        console.log(`[capaz] Transcripción del servidor: "${transcript}"`)
      }

      if (!transcript) {
        setState('idle')
        companionWin?.webContents.send('capaz:error', 'No se escuchó nada. Intenta de nuevo.')
        workspaceWin?.webContents.send('capaz:error', 'No se escuchó nada. Intenta de nuevo.')
        return
      }

      await processTurn(transcript, shot)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[capaz] Error en pipeline:', msg)
      resetFlow()
      setState('idle')
      companionWin?.webContents.send('capaz:error', msg)
      workspaceWin?.webContents.send('capaz:error', msg)
    }
  })

  ipcMain.on('capaz:ready-to-dismiss', () => {
    setState('idle')
  })

  ipcMain.on('capaz:toggle-in-page', (_e, active: boolean) => {
    capazInPage = active
    companionWin?.hide()
    islandWin?.hide()
    overlayWin?.hide()
  })

  ipcMain.on('capaz:click-hotspot', (_e, id: number) => {
    const idx = activeHotspots.findIndex((h) => h.id === id)
    if (idx === -1) return
    const [hit] = activeHotspots.splice(idx, 1)
    console.log(`[capaz] Hotspot cumplido por click en página: "${hit.label ?? hit.id}"`)
    overlayWin?.webContents.send('capaz:hotspot-hit', hit.id)
    workspaceWin?.webContents.send('capaz:hotspot-hit', hit.id)

    if (flowActive) {
      advanceFlow()
    } else if (!activeHotspots.length) {
      setTimeout(() => {
        if (appState === 'speaking') setState('idle')
      }, 3_000)
    }
  })

  ipcMain.on('capaz:start-recording-trigger', () => {
    handleHotkeyDown()
  })

  ipcMain.on('capaz:stop-recording-trigger', () => {
    handleHotkeyUp()
  })

  ipcMain.handle('capaz:text-command', async (_event, text: string) => {
    try {
      setState('thinking')
      const shot = await captureScreenshot()
      await processTurn(text, shot)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[capaz] Error en text-command:', msg)
      resetFlow()
      setState('idle')
      companionWin?.webContents.send('capaz:error', msg)
      workspaceWin?.webContents.send('capaz:error', msg)
    }
  })

  // ── Isla (consola de enseñanza) ─────────────────────
  ipcMain.on('island:expand', (_e, expanded: boolean) => {
    setIslandExpanded(expanded)
  })

  ipcMain.handle('flows:list', () => listFlows())

  ipcMain.handle('flows:delete', (_e, file: string) => {
    deleteFlow(file)
    return listFlows()
  })

  ipcMain.handle('flows:open', (_e, file: string) => {
    return shell.openPath(flowPath(file))
  })

  ipcMain.handle('flows:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Importar documento de proceso',
      buttonLabel: 'Importar',
      properties: ['openFile'],
      filters: [{ name: 'Documentos', extensions: ['pdf', 'md', 'txt'] }]
    })
    if (result.canceled || !result.filePaths.length) return null
    return await importFlow(result.filePaths[0])
  })
}

/** Click global del usuario: si cae cerca de un hotspot, lo marca como cumplido. */
export function handleGlobalClick(): void {
  if (!activeHotspots.length) return
  const pt = screen.getCursorScreenPoint()
  const idx = activeHotspots.findIndex((h) => Math.hypot(h.x - pt.x, h.y - pt.y) <= HIT_RADIUS)
  if (idx === -1) return

  const [hit] = activeHotspots.splice(idx, 1)
  console.log(`[capaz] Hotspot cumplido: "${hit.label ?? hit.id}" (click en ${pt.x},${pt.y})`)
  overlayWin?.webContents.send('capaz:hotspot-hit', hit.id)
  workspaceWin?.webContents.send('capaz:hotspot-hit', hit.id)

  if (flowActive) {
    // En modo guía, el click dispara el siguiente paso
    advanceFlow()
  } else if (!activeHotspots.length) {
    // Si era el último, la respuesta ya cumplió su propósito: despedirse solo
    setTimeout(() => {
      if (appState === 'speaking') setState('idle')
    }, 3_000)
  }
}

export function handleHotkeyDown(): void {
  // Presionar durante una respuesta la descarta y arranca la siguiente pregunta
  // (si hay guía activa, la pregunta continúa dentro de la guía)
  if (appState === 'speaking') setState('idle')
  if (appState !== 'idle') return
  // Grabar de inmediato: el screenshot corre en paralelo y se espera al enviar
  setState('listening')
  pendingScreenshot = captureScreenshot()
  pendingScreenshot.catch(() => {}) // se maneja al hacer await en capaz:audio
}

export function handleHotkeyUp(): void {
  if (appState !== 'listening') return
  console.log('[capaz] Hotkey soltado — pidiendo audio al companion')
  companionWin?.webContents.send('capaz:stop-recording')
  workspaceWin?.webContents.send('capaz:stop-recording')
  stopWatchdog = setTimeout(() => {
    if (appState === 'listening') {
      console.error('[capaz] El companion no envió audio en 8s — reseteando a idle')
      setState('idle')
      companionWin?.webContents.send('capaz:error', 'No se recibió audio del micrófono. Revisa la consola.')
      workspaceWin?.webContents.send('capaz:error', 'No se recibió audio del micrófono. Revisa la consola.')
    }
  }, 8_000)
}
