import './styles.css'
import { AnswerPayload, FlowMeta, HotspotPayload } from '../preload'

// Selectors
const btnEnable = document.getElementById('btn-enable-capaz') as HTMLButtonElement
const btnDisable = document.getElementById('btn-disable-capaz') as HTMLButtonElement
const capazBanner = document.getElementById('capaz-banner')!
const islandContainer = document.getElementById('island-container')!
const companionContainer = document.getElementById('companion-container')!
const hotspotsOverlay = document.getElementById('hotspots-overlay')!

const noteTitle = document.getElementById('note-title') as HTMLInputElement | null
const noteTextarea = document.getElementById('note-textarea') as HTMLTextAreaElement | null
const btnNewNote = document.getElementById('btn-new-note') as HTMLButtonElement | null
const btnSaveNote = document.getElementById('btn-save-note') as HTMLButtonElement | null
const btnAddTag = document.getElementById('btn-add-tag') as HTMLButtonElement | null
const tagsContainer = document.querySelector('.editor-tags')
const mainBalanceValue = document.getElementById('main-balance-value') as HTMLElement | null

// Island Selectors
const island = document.getElementById('island')!
const countEl = document.getElementById('pill-count')!
const listEl = document.getElementById('flow-list')!
const statusEl = document.getElementById('panel-status')!
const importBtn = document.getElementById('btn-import') as HTMLButtonElement | null

// Companion Selectors
const mini = document.getElementById('mini')!
const statusText = document.getElementById('status-text')!
const answerText = document.getElementById('answer-text')!
const debugTokens = document.getElementById('debug-tokens')!
const sidebarOptionsContainer = document.getElementById('sidebar-options-container')!
const hint = document.getElementById('hint')!
const bubbleEl = document.getElementById('bubble')!

// Global states
let capazActive = false
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let recStarting: Promise<void> | null = null
let micStream: MediaStream | null = null
let busy = false
let collapseTimer: ReturnType<typeof setTimeout> | null = null

const HINT_DEFAULT = 'Mantén ⌃⌥ para hablar'
const HINT_FLOW = '🧭 Guía activa — haz click en el punto verde'

const STATUS: Record<string, string> = {
  idle: '',
  listening: '🎙 Grabando… suelta para enviar',
  thinking: '⟳ Procesando…',
  speaking: ''
}

// ── Note actions ──────────────────────────────────────
if (btnNewNote && noteTitle && noteTextarea) {
  btnNewNote.addEventListener('click', () => {
    noteTitle.value = ''
    noteTextarea.value = ''
    noteTextarea.focus()
    showToast('✓ Nueva nota creada')
  })
}

if (btnSaveNote && noteTitle) {
  btnSaveNote.addEventListener('click', () => {
    const title = noteTitle.value.trim() || 'Nota sin título'
    showToast(`✓ Nota "${title}" guardada localmente`)
  })
}

if (btnAddTag && tagsContainer) {
  btnAddTag.addEventListener('click', () => {
    const tag = prompt('Escribe el nombre de la etiqueta (con #):')
    if (tag) {
      const formatted = tag.startsWith('#') ? tag : `#${tag}`
      const span = document.createElement('span')
      span.className = 'tag'
      span.textContent = formatted
      tagsContainer.insertBefore(span, btnAddTag)
    }
  })
}

function showToast(msg: string): void {
  const toast = document.createElement('div')
  toast.style.position = 'fixed'
  toast.style.bottom = '24px'
  toast.style.left = '50%'
  toast.style.transform = 'translateX(-50%)'
  toast.style.background = 'rgba(234, 4, 78, 0.95)'
  toast.style.border = '1px solid rgba(234, 4, 78, 0.3)'
  toast.style.color = '#ffffff'
  toast.style.padding = '10px 20px'
  toast.style.borderRadius = '8px'
  toast.style.fontSize = '13px'
  toast.style.fontWeight = '600'
  toast.style.zIndex = '1000'
  toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)'
  document.body.appendChild(toast)
  toast.textContent = msg
  setTimeout(() => toast.remove(), 3000)
}


// ── Toggle Capaz ─────────────────────────────────────
btnEnable.addEventListener('click', () => {
  capazActive = true
  btnEnable.classList.add('hidden')
  btnDisable.classList.remove('hidden')
  capazBanner.classList.add('capaz-active')
  // islandContainer permanece oculto (no se usa)
  companionContainer.classList.remove('companion-hidden')
  hotspotsOverlay.classList.remove('hotspots-hidden')
  
  if (window.capaz) {
    window.capaz.toggleInPage(true)
  }
  
  refreshFlows()
})

btnDisable.addEventListener('click', () => {
  capazActive = false
  btnDisable.classList.add('hidden')
  btnEnable.classList.remove('hidden')
  capazBanner.classList.remove('capaz-active')
  // islandContainer permanece oculto
  companionContainer.classList.add('companion-hidden')
  hotspotsOverlay.classList.add('hotspots-hidden')
  
  if (window.capaz) {
    window.capaz.toggleInPage(false)
  }
  
  clearHotspots()
  setWidgetState('idle')
})

declare global {
  interface Window {
    capaz?: {
      onState: (cb: (state: string) => void) => void
      onAnswer: (cb: (payload: any) => void) => void
      onError: (cb: (msg: string) => void) => void
      onStopRecording: (cb: () => void) => void
      onHotspots: (cb: (spots: any[]) => void) => void
      onHotspotHit: (cb: (id: number) => void) => void
      sendAudio: (buffer: ArrayBuffer) => Promise<void>
      dismiss: () => void
      toggleInPage: (active: boolean) => void
      startRecordingTrigger: () => void
      stopRecordingTrigger: () => void
    }
    island?: {
      listFlows: () => Promise<any[]>
      importFlow: () => Promise<any>
      deleteFlow: (file: string) => Promise<any[]>
      openFlow: (file: string) => Promise<any>
    }
  }
}

// ── Companion State Management ────────────────────────
let stateClass = 'state-idle'
let flipH = false
let flipV = false

function applyClasses(): void {
  mini.className = [stateClass, flipH ? 'flip-h' : '', flipV ? 'flip-v' : ''].filter(Boolean).join(' ')
}

function setWidgetState(state: string): void {
  stateClass = `state-${state}`
  applyClasses()
  statusText.textContent = STATUS[state] ?? ''
  if (state !== 'speaking') {
    answerText.textContent = ''
    debugTokens.textContent = ''
    hint.textContent = HINT_DEFAULT
    sidebarOptionsContainer.innerHTML = ''
  }
}

function parseAndRenderOptions(text: string, container: HTMLElement): void {
  container.innerHTML = ''
  const lines = text.split('\n')
  const optionRegex = /^[12]\.\s*(.+)$/i
  
  for (const line of lines) {
    const match = line.trim().match(optionRegex)
    if (match) {
      const optionText = match[0]
      const optionValue = optionText.substring(0, 1)
      
      const btn = document.createElement('button')
      btn.className = 'option-btn'
      btn.textContent = optionText
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (window.capaz && typeof (window.capaz as any).sendText === 'function') {
          ;(window.capaz as any).sendText(optionValue)
        } else {
          // Mock: options for "recibo próximo a vencer"
          if (optionValue === '1') {
            setWidgetState('thinking')
            setTimeout(() => {
              setWidgetState('speaking')
              answerText.textContent = 'El recibo más próximo a vencer es METROGAS por $ 34.837,83, que vence el 3 de agosto.'
              container.innerHTML = ''
            }, 1000)
          } else if (optionValue === '2') {
            setWidgetState('thinking')
            setTimeout(() => {
              setWidgetState('speaking')
              answerText.textContent = 'Hacé click en "Pago de Servicios" en el menú lateral izquierdo para ver todos tus recibos.'
              container.innerHTML = ''
              // Guide hotspot pointing to Pago de Servicios menu item
              const pagoItem = document.getElementById('menu-pago-servicios')
              if (pagoItem) {
                const rect = pagoItem.getBoundingClientRect()
                const mockSpots: HotspotPayload[] = [{
                  id: 20,
                  x: Math.round(rect.left + rect.width / 2),
                  y: Math.round(rect.top + rect.height / 2),
                  label: 'Pago de Servicios'
                }]
                renderHotspots(mockSpots)
              }
            }, 1000)
          }
        }
      })
      container.appendChild(btn)
    }
  }
}

// Mock Simulation mode inside standard browser
// Cycle: idle → simula pregunta sobre recibos → ofrece opciones
function runMockSequence(): void {
  if (mini.className.includes('state-idle')) {
    setWidgetState('listening')
    statusText.textContent = '🎙 Grabando… haz click en el orbe para enviar'
  } else if (mini.className.includes('state-listening')) {
    setWidgetState('thinking')
    statusText.textContent = '⟳ Procesando…'
    
    setTimeout(() => {
      setWidgetState('speaking')
      // Simula respuesta sobre recibos (el caso que ofrece opciones)
      answerText.textContent = 'El recibo más próximo a vencer es METROGAS, el 3 de agosto. ¿Qué prefieres?\n1. Que te dé más detalles directamente\n2. Que te guíe paso a paso para verlo'
      hint.textContent = HINT_DEFAULT
      parseAndRenderOptions(answerText.textContent, sidebarOptionsContainer)
    }, 1500)
  } else if (mini.className.includes('state-speaking')) {
    setWidgetState('idle')
    clearHotspots()
  }
}

// Orb Click Listener
const orbEl = document.getElementById('orb')!
orbEl.addEventListener('click', (e) => {
  e.stopPropagation()
  if (window.capaz) {
    if (mini.className.includes('state-idle')) {
      window.capaz.startRecordingTrigger()
    } else if (mini.className.includes('state-listening')) {
      // Al detener la grabación, vamos al estado "thinking" (naranja) inmediatamente
      setWidgetState('thinking')
      window.capaz.stopRecordingTrigger()
    } else if (mini.className.includes('state-speaking')) {
      window.capaz.dismiss()
    }
  } else {
    runMockSequence()
  }
})


// ── Audio Recording ──────────────────────────────────
let recognition: any = null
let localSpeechActive = false
let speechResultText = ''

async function startRecording(): Promise<void> {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (SpeechRecognition) {
    console.log('[capaz] Usando reconocimiento de voz local (Web Speech API) en página')
    localSpeechActive = true
    speechResultText = ''
    try {
      if (recognition) recognition.abort()
    } catch(e) {}
    
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'es-AR'
    
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      if (text) {
        speechResultText = text
      }
    }
    
    recognition.onerror = (event: any) => {
      console.error('[capaz] Error en SpeechRecognition local en página:', event.error)
    }
    
    recognition.start()
    return
  }

  localSpeechActive = false
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? { mimeType: 'audio/webm;codecs=opus' } : {}
    mediaRecorder = new MediaRecorder(micStream, opts)
    audioChunks = []
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.start(100)
    console.log('[capaz] Grabación en página iniciada (fallback)')
  } catch (err) {
    console.error('[capaz] Error accediendo a micrófono:', err)
  }
}

async function stopAndSend(): Promise<void> {
  if (localSpeechActive) {
    if (recognition) {
      recognition.stop()
      return new Promise((resolve) => {
        recognition.onend = async () => {
          console.log('[capaz] Enviando texto de voz local en página:', speechResultText)
          if (window.capaz) {
            await window.capaz.sendAudio({ text: speechResultText })
          } else {
            // Mock mode text handling
            handleMockTextCommand(speechResultText)
          }
          resolve()
        }
      })
    }
    return
  }

  if (recStarting) await recStarting
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    console.warn('[capaz] Grabación inactiva al detener')
    window.capaz?.dismiss()
    return
  }
  return new Promise((resolve) => {
    mediaRecorder!.onstop = async () => {
      const mime = mediaRecorder!.mimeType || 'audio/webm'
      const blob = new Blob(audioChunks, { type: mime })
      const buffer = await blob.arrayBuffer()
      micStream?.getTracks().forEach((t) => t.stop())
      micStream = null
      mediaRecorder = null
      console.log(`[capaz] Enviando ${buffer.byteLength} bytes de audio desde página`)
      if (window.capaz) {
        await window.capaz.sendAudio(buffer)
      }
      resolve()
    }
    mediaRecorder!.stop()
  })
}

// ── Hotspots management ──────────────────────────────
function clearHotspots(): void {
  hotspotsOverlay.innerHTML = ''
}

function findMatchingElement(label?: string): HTMLElement | null {
  if (!label) return null
  const clean = label.toLowerCase().trim()

  if (clean.includes('proveedor')) {
    const el = document.getElementById('menu-proveedores')
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('descuento')) {
    const el = document.getElementById('menu-descuentos')
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('carnes premium') || clean.includes('carne')) {
    const el = document.querySelector('.prov-card[data-prov-id="3"]') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('agregar')) {
    const el = document.querySelector('.prov-add-btn') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('ver carrito') || clean.includes('carrito')) {
    const el = document.getElementById('prov-go-to-cart') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('confirmar') || clean.includes('compra') || clean.includes('finalizar')) {
    const el = document.getElementById('prov-confirm-purchase') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('inicio')) {
    const el = document.getElementById('menu-inicio') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }
  if (clean.includes('pago de servicio') || clean.includes('servicio')) {
    const el = document.getElementById('menu-pago-servicios') as HTMLElement | null
    if (el && el.offsetParent !== null) return el
  }

  // Fallback: search interactive elements by text content
  const candidates = Array.from(document.querySelectorAll('a, button, .nav-item, .prov-card'))
  for (const candidate of candidates) {
    const text = candidate.textContent?.toLowerCase() || ''
    if (text.includes(clean) && (candidate as HTMLElement).offsetParent !== null) {
      return candidate as HTMLElement
    }
  }

  return null
}

function renderHotspots(spots: HotspotPayload[]): void {
  clearHotspots()
  for (const spot of spots) {
    let posX = spot.x
    let posY = spot.y

    const matchedEl = findMatchingElement(spot.label)
    if (matchedEl) {
      const rect = matchedEl.getBoundingClientRect()
      posX = Math.round(rect.left + rect.width / 2)
      posY = Math.round(rect.top + rect.height / 2)
      console.log(`[capaz] Hotspot auto-snapped to element "${spot.label}": (${posX}, ${posY})`)
    }

    const el = document.createElement('div')
    el.className = 'hotspot'
    el.id = `hotspot-${spot.id}`
    el.style.left = `${posX}px`
    el.style.top = `${posY}px`

    const ring = document.createElement('div')
    ring.className = 'ring'

    const dot = document.createElement('div')
    dot.className = 'dot'

    el.append(ring, dot)

    if (spot.label) {
      const label = document.createElement('div')
      label.className = 'label'
      label.textContent = spot.label
      el.append(label)
    }

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      
      // Trigger click on matched element or element under point
      const targetEl = matchedEl || (() => {
        el.style.pointerEvents = 'none'
        const u = document.elementFromPoint(posX, posY) as HTMLElement | null
        el.style.pointerEvents = 'auto'
        return u
      })()
      
      if (targetEl && typeof targetEl.click === 'function') {
        console.log(`[capaz] Hotspot clicked. Triggering click on: ${targetEl.id || targetEl.className || targetEl.tagName}`)
        targetEl.click()
      }
      
      handleHotspotHit(spot.id)
      
      if (window.capaz && typeof window.capaz.clickHotspot === 'function') {
        window.capaz.clickHotspot(spot.id)
      }
    })

    hotspotsOverlay.appendChild(el)
  }
}

function handleHotspotHit(id: number): void {
  const el = document.getElementById(`hotspot-${id}`)
  if (!el) return
  
  el.classList.add('hit')
  const check = document.createElement('div')
  check.className = 'check'
  check.textContent = '✓'
  el.appendChild(check)

  setTimeout(() => el.remove(), 1000)
}

// ── Island Logic ─────────────────────────────────────
function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg
  statusEl.className = isError ? 'error' : ''
}

function renderFlows(flows: FlowMeta[]): void {
  countEl.textContent = flows.length ? `${flows.length} proceso${flows.length === 1 ? '' : 's'}` : ''
  listEl.innerHTML = ''

  if (!flows.length) {
    const empty = document.createElement('div')
    empty.id = 'flow-empty'
    empty.textContent = 'Aún no hay procesos. Importa un documento para empezar.'
    listEl.appendChild(empty)
    return
  }

  for (const flow of flows) {
    const item = document.createElement('div')
    item.className = 'flow-item'

    const info = document.createElement('div')
    info.className = 'flow-info'
    const name = document.createElement('div')
    name.className = 'flow-name'
    name.textContent = flow.name
    const desc = document.createElement('div')
    desc.className = 'flow-desc'
    desc.textContent = flow.description || 'Sin descripción'
    info.append(name, desc)

    const steps = document.createElement('span')
    steps.className = 'flow-steps'
    steps.textContent = `${flow.steps} pasos`

    const editBtn = document.createElement('button')
    editBtn.textContent = '✎'
    editBtn.title = 'Editar'
    editBtn.addEventListener('click', () => window.island?.openFlow(flow.file))

    const delBtn = document.createElement('button')
    delBtn.className = 'delete'
    delBtn.textContent = '✕'
    delBtn.title = 'Eliminar'
    delBtn.addEventListener('click', async () => {
      if (window.island) {
        renderFlows(await window.island.deleteFlow(flow.file))
        setStatus(`"${flow.name}" eliminado`)
      }
    })

    item.append(info, steps, editBtn, delBtn)
    listEl.appendChild(item)
  }
}

async function refreshFlows(): Promise<void> {
  if (window.island) {
    renderFlows(await window.island.listFlows())
  }
}

importBtn.addEventListener('click', async () => {
  if (busy || !window.island) return
  busy = true
  importBtn.disabled = true
  setStatus('⟳ Convirtiendo documento en flujo…')
  try {
    const flow = await window.island.importFlow()
    if (flow) {
      setStatus(`✓ "${flow.name}" aprendido (${flow.steps} pasos)`)
      await refreshFlows()
    } else {
      setStatus('')
    }
  } catch (err) {
    console.error('[capaz] Error importando:', err)
    setStatus('Error al importar.', true)
  } finally {
    busy = false
    importBtn.disabled = false
  }
})

// Island hover interaction
island.addEventListener('mouseenter', () => {
  if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null }
  if (island.classList.contains('expanded')) return
  island.classList.replace('collapsed', 'expanded')
  refreshFlows()
})

island.addEventListener('mouseleave', () => {
  if (busy) return
  collapseTimer = setTimeout(() => {
    island.classList.replace('expanded', 'collapsed')
  }, 350)
})

// ── Bind IPC Listeners if running in Electron ─────────
if (window.capaz) {
  window.capaz.onState((state) => {
    if (!capazActive) return
    console.log('[capaz:IPC] Estado:', state)
    setWidgetState(state)
    if (state === 'listening') recStarting = startRecording()
  })

  window.capaz.onStopRecording(() => {
    if (!capazActive) return
    stopAndSend()
  })

  window.capaz.onAnswer((payload) => {
    if (!capazActive) return
    answerText.textContent = payload.answer
    debugTokens.textContent = `↑${payload.tokensIn} ↓${payload.tokensOut} tokens`
    hint.textContent = payload.flow ? HINT_FLOW : HINT_DEFAULT
    parseAndRenderOptions(payload.answer, sidebarOptionsContainer)
  })

  window.capaz.onError((msg) => {
    if (!capazActive) return
    answerText.textContent = `⚠ ${msg}`
    mini.className = 'state-speaking'
  })

  // Listen to hotspots and hotspot hit animations
  window.capaz.onHotspots((spots) => {
    if (!capazActive) return
    console.log('[capaz:IPC] Hotspots recibidos:', spots)
    renderHotspots(spots)
  })

  window.capaz.onHotspotHit((id) => {
    if (!capazActive) return
    handleHotspotHit(id)
  })
} else {
  console.log('Capaz corriendo en navegador sin Electron bridge (modo demo/simulación)')
}

// Cursor tracking for in-page orb
document.addEventListener('mousemove', (e) => {
  if (!capazActive) return

  const CURSOR_OFFSET = 22
  const miniWidth = 360
  const miniHeight = 280

  let x = e.clientX + CURSOR_OFFSET
  let y = e.clientY + CURSOR_OFFSET

  const nextFlipH = x + miniWidth > window.innerWidth
  const nextFlipV = y + miniHeight > window.innerHeight

  if (nextFlipH) x = e.clientX - miniWidth - CURSOR_OFFSET
  if (nextFlipV) y = e.clientY - miniHeight - CURSOR_OFFSET

  if (nextFlipH !== flipH || nextFlipV !== flipV) {
    flipH = nextFlipH
    flipV = nextFlipV
    applyClasses()
  }

  companionContainer.style.left = `${x}px`
  companionContainer.style.top = `${y}px`
})
// Keyboard shortcut simulation in standard browser (Control + Option)
let ctrlPressed = false
let altPressed = false
let recordingActive = false

document.addEventListener('keydown', (e) => {
  if (!capazActive || window.capaz) return // Electron uiohook handles it if in app

  if (e.key === 'Control') ctrlPressed = true
  if (e.key === 'Alt') altPressed = true

  if (ctrlPressed && altPressed && !recordingActive) {
    recordingActive = true
    e.preventDefault()
    runMockSequence()
  }
})

document.addEventListener('keyup', (e) => {
  if (window.capaz) return

  if (e.key === 'Control') ctrlPressed = false
  if (e.key === 'Alt') altPressed = false

  if (recordingActive && (!ctrlPressed || !altPressed)) {
    recordingActive = false
    runMockSequence()
  }
})

// ── Login Controller ──────────────────────────────────
const loginContainer = document.getElementById('login-container')!
const loginUsername = document.getElementById('login-username') as HTMLInputElement
const loginPassword = document.getElementById('login-password') as HTMLInputElement
const btnLogin = document.getElementById('btn-login') as HTMLButtonElement
const btnLogout = document.getElementById('btn-logout') as HTMLButtonElement
const loginError = document.getElementById('login-error')!
const appContainer = document.getElementById('app-container')!

function handleLogin(): void {
  const user = loginUsername.value.trim()
  const pass = loginPassword.value
  
  if (user === 'usuario' && pass === 'contraseña123') {
    loginContainer.classList.add('fade-out')
    appContainer.classList.remove('hidden')
  } else {
    loginError.classList.remove('hidden')
    const card = loginContainer.querySelector('.login-form-wrapper')!
    card.classList.add('shake')
    setTimeout(() => card.classList.remove('shake'), 500)
  }
}

function handleLogout(): void {
  // If LucIA is active, turn it off programmatically
  if (capazActive) {
    btnDisable.click()
  }
  
  // Hide workspace
  appContainer.classList.add('hidden')
  
  // Reveal login overlay
  loginContainer.classList.remove('fade-out')
  
  // Reset inputs
  loginUsername.value = ''
  loginPassword.value = ''
  loginError.classList.add('hidden')
  btnLogin.classList.remove('active-btn')
}

// Check inputs to toggle active red button styling
function updateLoginBtnState(): void {
  if (loginUsername.value.trim().length > 0 && loginPassword.value.length > 0) {
    btnLogin.classList.add('active-btn')
  } else {
    btnLogin.classList.remove('active-btn')
  }
}

btnLogin.addEventListener('click', handleLogin)
loginUsername.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin()
})
loginPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin()
})
loginUsername.addEventListener('input', updateLoginBtnState)
loginPassword.addEventListener('input', updateLoginBtnState)

if (btnLogout) {
  btnLogout.addEventListener('click', handleLogout)
}

// Password visibility toggle
const btnTogglePassword = document.getElementById('btn-toggle-password')
if (btnTogglePassword) {
  btnTogglePassword.addEventListener('click', () => {
    const isPass = loginPassword.type === 'password'
    loginPassword.type = isPass ? 'text' : 'password'
    btnTogglePassword.innerHTML = isPass
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-off-svg"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
  })
}

// ── Navigation Routing ─────────────────────────────────
const navMap: { menuId: string; viewId: string }[] = [
  { menuId: 'menu-inicio',          viewId: 'view-inicio' },
  { menuId: 'menu-movimientos',     viewId: 'view-movimientos' },
  { menuId: 'menu-tarjetas',        viewId: 'view-tarjetas' },
  { menuId: 'menu-inversiones',     viewId: 'view-inversiones' },
  { menuId: 'menu-pago-servicios',  viewId: 'view-pago-servicios' },
  { menuId: 'menu-peya-pos',        viewId: 'view-peya-pos' },
  { menuId: 'menu-prestamos',       viewId: 'view-prestamos' },
  { menuId: 'menu-proveedores',     viewId: 'view-proveedores' },
  { menuId: 'menu-descuentos',      viewId: 'view-descuentos' },
  { menuId: 'menu-ayuda',           viewId: 'view-ayuda' },
]

function navigateTo(targetViewId: string): void {
  // Toggle view panels
  navMap.forEach(({ viewId }) => {
    const panel = document.getElementById(viewId)
    if (panel) {
      panel.classList.toggle('hidden', viewId !== targetViewId)
    }
  })

  // Toggle active class on nav items
  navMap.forEach(({ menuId, viewId }) => {
    const menuItem = document.getElementById(menuId)
    if (menuItem) {
      menuItem.classList.toggle('active', viewId === targetViewId)
    }
  })

  // Reset proveedores view when navigating to it
  if (targetViewId === 'view-proveedores') {
    provCurrentStep = 1
    provSelectedProvider = null
    provCart = []
    renderProveedoresView()
  }
}

navMap.forEach(({ menuId, viewId }) => {
  const menuItem = document.getElementById(menuId)
  if (menuItem) {
    menuItem.addEventListener('click', (e) => {
      e.preventDefault()
      navigateTo(viewId)
    })
  }
})

// "Ver historial" link on inicio -> navigate to movimientos
const linkViewAllActivity = document.getElementById('link-view-all-activity')
if (linkViewAllActivity) {
  linkViewAllActivity.addEventListener('click', (e) => {
    e.preventDefault()
    navigateTo('view-movimientos')
  })
}

// Quick action: Pago de servicios shortcut
const btnRevealSaldoPago = document.getElementById('btn-reveal-saldo-pago')
if (btnRevealSaldoPago) {
  btnRevealSaldoPago.addEventListener('click', () => {
    navigateTo('view-pago-servicios')
  })
}

// Tarjetas shortcuts
const btnGoTarjetas = document.getElementById('btn-go-tarjetas')
if (btnGoTarjetas) {
  btnGoTarjetas.addEventListener('click', () => navigateTo('view-tarjetas'))
}
const btnGoTarjetasVisa = document.getElementById('btn-go-tarjetas-visa')
if (btnGoTarjetasVisa) {
  btnGoTarjetasVisa.addEventListener('click', () => navigateTo('view-tarjetas'))
}


// ── Proveedores Shopping Module ──────────────────────────────
interface ProvProduct {
  id: number
  name: string
  unit: string
  price: number
  emoji: string
}

interface ProvProvider {
  id: number
  name: string
  category: string
  icon: string
  iconBg: string
  rating: number
  delivery: string
  minOrder: string
  products: ProvProduct[]
}

interface ProvCartItem {
  product: ProvProduct
  providerId: number
  qty: number
}

// Mock Data
const PROVIDERS: ProvProvider[] = [
  {
    id: 1, name: 'Distribuidora Sur', category: 'Alimentos secos', icon: '🏪',
    iconBg: '#fef3c7', rating: 4.8, delivery: '24hs', minOrder: '$15.000',
    products: [
      { id: 101, name: 'Harina 000 x 25kg', unit: 'Bolsa', price: 8500, emoji: '🌾' },
      { id: 102, name: 'Aceite girasol x 5L', unit: 'Bidón', price: 6200, emoji: '🫒' },
      { id: 103, name: 'Sal fina x 10kg', unit: 'Bolsa', price: 2800, emoji: '🧂' },
      { id: 104, name: 'Azúcar x 10kg', unit: 'Bolsa', price: 5100, emoji: '🍬' },
      { id: 105, name: 'Fideos secos x 5kg', unit: 'Caja', price: 4300, emoji: '🍝' },
      { id: 106, name: 'Arroz largo fino x 10kg', unit: 'Bolsa', price: 7600, emoji: '🍚' },
    ]
  },
  {
    id: 2, name: 'Lácteos Del Campo', category: 'Lácteos y frescos', icon: '🧀',
    iconBg: '#dbeafe', rating: 4.6, delivery: '12hs', minOrder: '$10.000',
    products: [
      { id: 201, name: 'Queso cremoso x 5kg', unit: 'Horma', price: 18500, emoji: '🧀' },
      { id: 202, name: 'Mozzarella rallada x 2.5kg', unit: 'Bolsa', price: 12800, emoji: '🧀' },
      { id: 203, name: 'Crema de leche x 5L', unit: 'Sachet', price: 9400, emoji: '🥛' },
      { id: 204, name: 'Manteca x 2kg', unit: 'Plancha', price: 6700, emoji: '🧈' },
      { id: 205, name: 'Leche entera x 12L', unit: 'Pack', price: 8900, emoji: '🥛' },
      { id: 206, name: 'Yogur natural x 5kg', unit: 'Balde', price: 5200, emoji: '🍶' },
    ]
  },
  {
    id: 3, name: 'Carnes Premium BA', category: 'Carnes y embutidos', icon: '🥩',
    iconBg: '#fee2e2', rating: 4.9, delivery: '6hs', minOrder: '$20.000',
    products: [
      { id: 301, name: 'Vacío entero x 5kg', unit: 'Pieza', price: 32000, emoji: '🥩' },
      { id: 302, name: 'Pechuga de pollo x 5kg', unit: 'Bolsa', price: 14500, emoji: '🍗' },
      { id: 303, name: 'Carne picada especial x 5kg', unit: 'Bolsa', price: 19800, emoji: '🥩' },
      { id: 304, name: 'Costilla de cerdo x 3kg', unit: 'Bandeja', price: 16200, emoji: '🍖' },
      { id: 305, name: 'Chorizo parrillero x 5kg', unit: 'Bolsa', price: 11500, emoji: '🌭' },
      { id: 306, name: 'Medallón de lomo x 2kg', unit: 'Bandeja', price: 22000, emoji: '🥩' },
    ]
  },
  {
    id: 4, name: 'Bebidas Express', category: 'Bebidas', icon: '🥤',
    iconBg: '#dcfce7', rating: 4.5, delivery: '24hs', minOrder: '$8.000',
    products: [
      { id: 401, name: 'Coca-Cola 2.25L x 6', unit: 'Pack', price: 9600, emoji: '🥤' },
      { id: 402, name: 'Agua mineral x 12', unit: 'Pack', price: 4800, emoji: '💧' },
      { id: 403, name: 'Cerveza lager 1L x 12', unit: 'Cajón', price: 15600, emoji: '🍺' },
      { id: 404, name: 'Jugo naranja 1L x 6', unit: 'Pack', price: 7200, emoji: '🍊' },
      { id: 405, name: 'Soda sifón x 12', unit: 'Pack', price: 5400, emoji: '🫧' },
      { id: 406, name: 'Vino tinto Malbec 750ml x 6', unit: 'Caja', price: 18000, emoji: '🍷' },
    ]
  },
  {
    id: 5, name: 'Limpieza Pro', category: 'Limpieza e higiene', icon: '🧹',
    iconBg: '#e0e7ff', rating: 4.3, delivery: '48hs', minOrder: '$5.000',
    products: [
      { id: 501, name: 'Detergente 5L', unit: 'Bidón', price: 4200, emoji: '🧴' },
      { id: 502, name: 'Lavandina 5L', unit: 'Bidón', price: 2800, emoji: '🧪' },
      { id: 503, name: 'Desengrasante 5L', unit: 'Bidón', price: 5100, emoji: '✨' },
      { id: 504, name: 'Rollo de cocina x 24', unit: 'Pack', price: 6800, emoji: '🧻' },
      { id: 505, name: 'Bolsas residuos 80L x 100', unit: 'Rollo', price: 3500, emoji: '🗑️' },
      { id: 506, name: 'Guantes látex M x 100', unit: 'Caja', price: 4900, emoji: '🧤' },
    ]
  },
  {
    id: 6, name: 'Packaging Total', category: 'Descartables y envases', icon: '📦',
    iconBg: '#fef9c3', rating: 4.7, delivery: '24hs', minOrder: '$6.000',
    products: [
      { id: 601, name: 'Contenedor térmico 750ml x 100', unit: 'Pack', price: 8900, emoji: '📦' },
      { id: 602, name: 'Bolsa papel kraft x 500', unit: 'Pack', price: 5600, emoji: '🛍️' },
      { id: 603, name: 'Vaso descartable 300ml x 100', unit: 'Pack', price: 3200, emoji: '🥤' },
      { id: 604, name: 'Film adherente 300m', unit: 'Rollo', price: 4100, emoji: '🎞️' },
      { id: 605, name: 'Bandeja aluminio x 50', unit: 'Pack', price: 6300, emoji: '🍽️' },
      { id: 606, name: 'Servilletas x 1000', unit: 'Pack', price: 2700, emoji: '🧻' },
    ]
  }
]

const STEP_LABELS = ['Proveedores', 'Productos', 'Carrito', 'Confirmar', 'Listo']
const LUZIA_MESSAGES: Record<number, string> = {
  1: '<strong>LuzIA:</strong> ¡Hola! 👋 Elegí un proveedor del catálogo para empezar tu pedido. Podés filtrar por categoría.',
  2: '<strong>LuzIA:</strong> Bien, ahora seleccioná los productos que necesitás y la cantidad. Cuando termines, avanzá al carrito. 🛒',
  3: '<strong>LuzIA:</strong> Revisá tu pedido. Podés modificar cantidades o eliminar productos antes de continuar. ✅',
  4: '<strong>LuzIA:</strong> Todo listo para confirmar. Verificá los datos y el método de pago, luego hacé click en "Confirmar compra". 💳',
  5: '<strong>LuzIA:</strong> ¡Compra realizada con éxito! 🎉 Tu pedido llegará en las próximas horas. ¡Seguí así!'
}

let provCurrentStep = 1
let provSelectedProvider: ProvProvider | null = null
let provCart: ProvCartItem[] = []

const provStepperEl = document.getElementById('prov-stepper')!
const provContentEl = document.getElementById('prov-dynamic-content')!
const provNavBadge = document.getElementById('prov-nav-badge')!

function formatPrice(amount: number): string {
  return '$ ' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getCartTotal(): number {
  return provCart.reduce((sum, item) => sum + item.product.price * item.qty, 0)
}

function getCartCount(): number {
  return provCart.reduce((sum, item) => sum + item.qty, 0)
}

function updateCartBadge(): void {
  const count = getCartCount()
  if (count > 0) {
    provNavBadge.className = 'prov-cart-badge'
    provNavBadge.textContent = String(count)
  } else {
    provNavBadge.className = ''
    provNavBadge.textContent = ''
  }
}

function renderStepper(): void {
  provStepperEl.innerHTML = ''
  for (let i = 0; i < STEP_LABELS.length; i++) {
    const step = i + 1
    const isDone = step < provCurrentStep
    const isActive = step === provCurrentStep

    const group = document.createElement('div')
    group.className = 'prov-step-group'

    const circle = document.createElement('div')
    circle.className = 'prov-step-circle' + (isDone ? ' done' : isActive ? ' active' : '')
    circle.textContent = isDone ? '✓' : String(step)

    const label = document.createElement('div')
    label.className = 'prov-step-label' + (isDone ? ' done' : isActive ? ' active' : '')
    label.textContent = STEP_LABELS[i]

    group.append(circle, label)
    provStepperEl.appendChild(group)

    if (i < STEP_LABELS.length - 1) {
      const line = document.createElement('div')
      line.className = 'prov-step-line' + (isDone ? ' done' : '')
      line.style.marginBottom = '22px'
      provStepperEl.appendChild(line)
    }
  }
}

function renderProveedoresView(): void {
  renderStepper()
  updateCartBadge()

  switch (provCurrentStep) {
    case 1: renderCatalog(); break
    case 2: renderProducts(); break
    case 3: renderCart(); break
    case 4: renderCheckout(); break
    case 5: renderSuccess(); break
  }
}

// Step 1: Provider Catalog
function renderCatalog(): void {
  let html = '<div class="prov-catalog-grid">'
  for (const prov of PROVIDERS) {
    html += `
      <div class="prov-card" data-prov-id="${prov.id}">
        <div class="prov-card-icon" style="background: ${prov.iconBg}">${prov.icon}</div>
        <div>
          <div class="prov-card-name">${prov.name}</div>
          <div class="prov-card-category">${prov.category}</div>
        </div>
        <div class="prov-card-meta">
          <span class="prov-card-rating">★ ${prov.rating}</span>
          <span class="prov-card-delivery">🚚 ${prov.delivery}</span>
          <span>Min: ${prov.minOrder}</span>
        </div>
      </div>
    `
  }
  html += '</div>'
  provContentEl.innerHTML = html

  // Bind clicks
  provContentEl.querySelectorAll('.prov-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.getAttribute('data-prov-id'))
      provSelectedProvider = PROVIDERS.find(p => p.id === id) || null
      if (provSelectedProvider) {
        provCurrentStep = 2
        renderProveedoresView()
      }
    })
  })
}

// Step 2: Products
function renderProducts(): void {
  if (!provSelectedProvider) return

  const prov = provSelectedProvider
  let html = `
    <div class="prov-products-header">
      <div>
        <div style="font-size: 18px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">
          ${prov.icon} ${prov.name}
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">${prov.category} • Entrega en ${prov.delivery}</div>
      </div>
      <button class="prov-back-btn" id="prov-back-to-catalog">← Volver a proveedores</button>
    </div>
    <div class="prov-products-grid">
  `

  for (const prod of prov.products) {
    const inCart = provCart.find(c => c.product.id === prod.id)
    const qty = inCart ? inCart.qty : 0

    html += `
      <div class="prov-product-card">
        <div class="prov-product-emoji">${prod.emoji}</div>
        <div class="prov-product-info">
          <div class="prov-product-name">${prod.name}</div>
          <div class="prov-product-unit">${prod.unit}</div>
          <div class="prov-product-price">${formatPrice(prod.price)}</div>
        </div>
        <div class="prov-product-actions">
          ${qty > 0 ? `
            <button class="prov-qty-btn" data-action="dec" data-prod-id="${prod.id}">−</button>
            <span class="prov-qty-value">${qty}</span>
            <button class="prov-qty-btn" data-action="inc" data-prod-id="${prod.id}">+</button>
          ` : `
            <button class="prov-add-btn" data-prod-id="${prod.id}">Agregar</button>
          `}
        </div>
      </div>
    `
  }

  html += '</div>'

  // Cart summary bar if items in cart
  const cartCount = getCartCount()
  if (cartCount > 0) {
    html += `
      <div class="prov-cart-total-bar" style="margin-top: 20px;">
        <div>
          <span class="prov-cart-total-label">${cartCount} producto${cartCount !== 1 ? 's' : ''} en el carrito</span>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <span class="prov-cart-total-value">${formatPrice(getCartTotal())}</span>
          <button class="prov-btn-primary" id="prov-go-to-cart" style="flex: none; padding: 12px 24px;">Ver carrito →</button>
        </div>
      </div>
    `
  }

  provContentEl.innerHTML = html

  // Bind events
  document.getElementById('prov-back-to-catalog')?.addEventListener('click', () => {
    provCurrentStep = 1
    renderProveedoresView()
  })

  document.getElementById('prov-go-to-cart')?.addEventListener('click', () => {
    provCurrentStep = 3
    renderProveedoresView()
  })

  provContentEl.querySelectorAll('.prov-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = Number(btn.getAttribute('data-prod-id'))
      addToCart(prodId)
      renderProducts()
      renderStepper()
      updateCartBadge()
    })
  })

  provContentEl.querySelectorAll('.prov-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = Number(btn.getAttribute('data-prod-id'))
      const action = btn.getAttribute('data-action')
      if (action === 'inc') changeQty(prodId, 1)
      else changeQty(prodId, -1)
      renderProducts()
      renderStepper()
      updateCartBadge()
    })
  })
}

function addToCart(prodId: number): void {
  if (!provSelectedProvider) return
  const product = provSelectedProvider.products.find(p => p.id === prodId)
  if (!product) return

  const existing = provCart.find(c => c.product.id === prodId)
  if (existing) {
    existing.qty++
  } else {
    provCart.push({ product, providerId: provSelectedProvider.id, qty: 1 })
  }
}

function changeQty(prodId: number, delta: number): void {
  const item = provCart.find(c => c.product.id === prodId)
  if (!item) return
  item.qty += delta
  if (item.qty <= 0) {
    provCart = provCart.filter(c => c.product.id !== prodId)
  }
}

// Step 3: Cart
function renderCart(): void {
  if (provCart.length === 0) {
    provContentEl.innerHTML = `
      <div class="prov-empty-state">
        <div class="prov-empty-icon">🛒</div>
        <div class="prov-empty-text">Tu carrito está vacío</div>
        <div class="prov-empty-sub">Agregá productos de algún proveedor para empezar</div>
        <button class="prov-btn-secondary" id="prov-empty-back" style="margin-top: 20px;">← Volver al catálogo</button>
      </div>
    `
    document.getElementById('prov-empty-back')?.addEventListener('click', () => {
      provCurrentStep = 1
      renderProveedoresView()
    })
    return
  }

  let html = '<div class="prov-cart-container">'

  for (const item of provCart) {
    const subtotal = item.product.price * item.qty
    html += `
      <div class="prov-cart-item">
        <div class="prov-cart-item-info">
          <span class="prov-cart-item-emoji">${item.product.emoji}</span>
          <div>
            <div class="prov-cart-item-name">${item.product.name}</div>
            <div class="prov-cart-item-unit">${item.product.unit} • ${formatPrice(item.product.price)} c/u</div>
          </div>
        </div>
        <div class="prov-product-actions">
          <button class="prov-qty-btn" data-action="dec" data-prod-id="${item.product.id}">−</button>
          <span class="prov-qty-value">${item.qty}</span>
          <button class="prov-qty-btn" data-action="inc" data-prod-id="${item.product.id}">+</button>
        </div>
        <span class="prov-cart-item-subtotal">${formatPrice(subtotal)}</span>
        <button class="prov-cart-remove" data-prod-id="${item.product.id}" title="Eliminar">✕</button>
      </div>
    `
  }

  html += '</div>'

  html += `
    <div class="prov-cart-total-bar">
      <span class="prov-cart-total-label">Total del pedido</span>
      <span class="prov-cart-total-value">${formatPrice(getCartTotal())}</span>
    </div>
    <div class="prov-cart-actions">
      <button class="prov-btn-secondary" id="prov-cart-back">← Seguir comprando</button>
      <button class="prov-btn-primary" id="prov-cart-checkout">Continuar al pago →</button>
    </div>
  `

  provContentEl.innerHTML = html

  // Bind events
  document.getElementById('prov-cart-back')?.addEventListener('click', () => {
    provCurrentStep = 2
    renderProveedoresView()
  })

  document.getElementById('prov-cart-checkout')?.addEventListener('click', () => {
    provCurrentStep = 4
    renderProveedoresView()
  })

  provContentEl.querySelectorAll('.prov-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = Number(btn.getAttribute('data-prod-id'))
      const action = btn.getAttribute('data-action')
      if (action === 'inc') changeQty(prodId, 1)
      else changeQty(prodId, -1)
      renderCart()
      renderStepper()
      updateCartBadge()
    })
  })

  provContentEl.querySelectorAll('.prov-cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const prodId = Number(btn.getAttribute('data-prod-id'))
      provCart = provCart.filter(c => c.product.id !== prodId)
      renderCart()
      renderStepper()
      updateCartBadge()
    })
  })
}

// Step 4: Checkout
function renderCheckout(): void {
  const total = getCartTotal()
  const envio = 2500
  const grandTotal = total + envio

  let itemsHtml = ''
  for (const item of provCart) {
    itemsHtml += `
      <div class="prov-checkout-row">
        <span class="prov-checkout-row-label">${item.product.emoji} ${item.product.name} x${item.qty}</span>
        <span class="prov-checkout-row-value">${formatPrice(item.product.price * item.qty)}</span>
      </div>
    `
  }

  const providerName = provSelectedProvider ? provSelectedProvider.name : 'Proveedor'

  provContentEl.innerHTML = `
    <div class="prov-checkout-grid">
      <div>
        <div class="prov-checkout-section">
          <h3 class="prov-checkout-title">📋 Resumen del pedido</h3>
          ${itemsHtml}
          <div class="prov-checkout-row" style="border-bottom: none;">
            <span class="prov-checkout-row-label">🚚 Envío</span>
            <span class="prov-checkout-row-value">${formatPrice(envio)}</span>
          </div>
          <div class="prov-checkout-total-row">
            <span class="prov-checkout-total-label">Total a pagar</span>
            <span class="prov-checkout-total-value">${formatPrice(grandTotal)}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="prov-checkout-section">
          <h3 class="prov-checkout-title">📍 Datos de entrega</h3>
          <div class="prov-checkout-row">
            <span class="prov-checkout-row-label">Proveedor</span>
            <span class="prov-checkout-row-value">${providerName}</span>
          </div>
          <div class="prov-checkout-row">
            <span class="prov-checkout-row-label">Dirección</span>
            <span class="prov-checkout-row-value">Av. Corrientes 1234</span>
          </div>
          <div class="prov-checkout-row">
            <span class="prov-checkout-row-label">Entrega estimada</span>
            <span class="prov-checkout-row-value">${provSelectedProvider?.delivery || '24hs'}</span>
          </div>
        </div>

        <div class="prov-checkout-section" style="margin-top: 16px;">
          <h3 class="prov-checkout-title">💳 Método de pago</h3>
          <div class="prov-payment-option">
            <div class="prov-payment-radio"><div class="prov-payment-radio-inner"></div></div>
            <div class="prov-payment-info">
              <div class="prov-payment-name">Saldo PeYa Wallet</div>
              <div class="prov-payment-balance">Disponible: $ 4.452,94</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="prov-cart-actions" style="margin-top: 20px;">
      <button class="prov-btn-secondary" id="prov-checkout-back">← Volver al carrito</button>
      <button class="prov-btn-primary" id="prov-confirm-purchase">Confirmar compra</button>
    </div>
  `

  document.getElementById('prov-checkout-back')?.addEventListener('click', () => {
    provCurrentStep = 3
    renderProveedoresView()
  })

  document.getElementById('prov-confirm-purchase')?.addEventListener('click', () => {
    // Simulate processing
    const btn = document.getElementById('prov-confirm-purchase') as HTMLButtonElement
    btn.disabled = true
    btn.textContent = 'Procesando...'

    setTimeout(() => {
      // Deduct from balance display
      if (mainBalanceValue) {
        const total = getCartTotal() + 2500
        const currentBalance = 4452.94
        const newBalance = currentBalance - total
        mainBalanceValue.textContent = formatPrice(Math.max(0, newBalance))
      }

      provCurrentStep = 5
      renderProveedoresView()
      launchConfetti()
    }, 2000)
  })
}

// Step 5: Success
function renderSuccess(): void {
  const orderNum = 'PYW-' + String(Math.floor(100000 + Math.random() * 900000))
  const total = getCartTotal() + 2500
  const itemCount = getCartCount()
  const provName = provSelectedProvider?.name || 'Proveedor'

  provContentEl.innerHTML = `
    <div class="prov-success-container">
      <div class="prov-success-check">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <h2 class="prov-success-title">¡Compra realizada con éxito!</h2>
      <p class="prov-success-subtitle">Tu pedido fue enviado a ${provName}.<br>Recibirás la entrega en las próximas ${provSelectedProvider?.delivery || '24hs'}.</p>

      <div class="prov-success-order-card">
        <div class="prov-success-order-number">PEDIDO ${orderNum}</div>
        <div class="prov-success-detail-row">
          <span class="prov-success-detail-label">Proveedor</span>
          <span class="prov-success-detail-value">${provName}</span>
        </div>
        <div class="prov-success-detail-row">
          <span class="prov-success-detail-label">Productos</span>
          <span class="prov-success-detail-value">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="prov-success-detail-row">
          <span class="prov-success-detail-label">Total pagado</span>
          <span class="prov-success-detail-value" style="color: var(--accent-color); font-weight: 800;">${formatPrice(total)}</span>
        </div>
        <div class="prov-success-detail-row">
          <span class="prov-success-detail-label">Método de pago</span>
          <span class="prov-success-detail-value">Saldo PeYa Wallet</span>
        </div>
        <div class="prov-success-detail-row">
          <span class="prov-success-detail-label">Entrega estimada</span>
          <span class="prov-success-detail-value">${provSelectedProvider?.delivery || '24hs'}</span>
        </div>
      </div>

      <button class="prov-btn-primary" id="prov-back-to-home" style="max-width: 320px;">Volver al inicio</button>
    </div>
  `

  document.getElementById('prov-back-to-home')?.addEventListener('click', () => {
    provCurrentStep = 1
    provSelectedProvider = null
    provCart = []
    updateCartBadge()
    navigateTo('view-inicio')
  })
}

// Confetti effect
function launchConfetti(): void {
  const container = document.createElement('div')
  container.className = 'prov-confetti-container'
  document.body.appendChild(container)

  const colors = ['#EA044E', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']

  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div')
    piece.className = 'prov-confetti-piece'
    piece.style.left = Math.random() * 100 + '%'
    piece.style.background = colors[Math.floor(Math.random() * colors.length)]
    piece.style.animationDelay = Math.random() * 1.5 + 's'
    piece.style.width = (4 + Math.random() * 8) + 'px'
    piece.style.height = (4 + Math.random() * 8) + 'px'
    container.appendChild(piece)
  }

  setTimeout(() => container.remove(), 4000)
}
