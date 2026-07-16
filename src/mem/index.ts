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

function renderHotspots(spots: HotspotPayload[]): void {
  clearHotspots()
  for (const spot of spots) {
    const el = document.createElement('div')
    el.className = 'hotspot'
    el.id = `hotspot-${spot.id}`
    el.style.left = `${spot.x}px`
    el.style.top = `${spot.y}px`

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
      
      // Find element underneath the hotspot
      el.style.pointerEvents = 'none'
      const underEl = document.elementFromPoint(spot.x, spot.y) as HTMLElement | null
      el.style.pointerEvents = 'auto'
      
      if (underEl && typeof underEl.click === 'function') {
        console.log(`[capaz] Hotspot clicked. Triggering click on: ${underEl.id || underEl.tagName}`)
        underEl.click()
      }
      
      handleHotspotHit(spot.id)
      
      if (spot.id === 10) {
        setWidgetState('thinking')
        setTimeout(() => {
          setWidgetState('speaking')
          answerText.textContent = '¡Excelente! Ahí puedes ver tu saldo disponible de $ 4.452,94. ¿Necesitas algo más?'
          setTimeout(() => {
            setWidgetState('idle')
            clearHotspots()
          }, 6000)
        }, 1000)
      }
      
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


