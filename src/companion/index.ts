import './styles.css'

interface AnswerPayload {
  answer: string
  question: string
  tokensIn: number
  tokensOut: number
  flow: boolean
}

interface CapazAPI {
  onState: (cb: (state: string) => void) => void
  onAnswer: (cb: (payload: AnswerPayload) => void) => void
  onError: (cb: (msg: string) => void) => void
  onStopRecording: (cb: () => void) => void
  onFlip: (cb: (flip: { h: boolean; v: boolean }) => void) => void
  sendAudio: (buffer: ArrayBuffer) => Promise<void>
  dismiss: () => void
}

declare global {
  interface Window { capaz: CapazAPI }
}

const mini = document.getElementById('mini')!
const statusEl = document.getElementById('status-text')!
const answerEl = document.getElementById('answer-text')!
const debugEl = document.getElementById('debug-tokens')!
const optionsContainer = document.getElementById('options-container')!
const hintEl = document.getElementById('hint')!
const bubbleEl = document.getElementById('bubble')!

const HINT_DEFAULT = '⌃⌥ (Control+Option): nueva pregunta'
const HINT_FLOW = '🧭 Guía activa — haz click en el punto verde'

const STATUS: Record<string, string> = {
  idle: '',
  listening: '🎙 Grabando… suelta para enviar',
  thinking: '⟳ Procesando…',
  speaking: ''
}

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let dismissTimer: ReturnType<typeof setTimeout> | null = null
let micStream: MediaStream | null = null
let recStarting: Promise<void> | null = null

let stateClass = 'state-idle'
let flipH = false
let flipV = false

function applyClasses(): void {
  mini.className = [stateClass, flipH ? 'flip-h' : '', flipV ? 'flip-v' : ''].filter(Boolean).join(' ')
}

function setWidgetState(state: string): void {
  stateClass = `state-${state}`
  applyClasses()
  statusEl.textContent = STATUS[state] ?? ''
  if (state !== 'speaking') {
    answerEl.textContent = ''
    debugEl.textContent = ''
    hintEl.textContent = HINT_DEFAULT
    optionsContainer.innerHTML = ''
  }
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
  if (state === 'speaking') {
    dismissTimer = setTimeout(() => window.capaz.dismiss(), 15_000)
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
          (window.capaz as any).sendText(optionValue)
        }
      })
      container.appendChild(btn)
    }
  }
}

async function startRecording(): Promise<void> {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? { mimeType: 'audio/webm;codecs=opus' } : {}
    mediaRecorder = new MediaRecorder(micStream, opts)
    audioChunks = []
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.start(100)
    console.log('[capaz] Grabación de audio iniciada')
  } catch (err) {
    console.error('[capaz] Error al acceder al micrófono:', err)
  }
}

async function stopAndSend(): Promise<void> {
  // Cambiar al estado de "pensando" (naranja) inmediatamente al soltar el hotkey
  setWidgetState('thinking')

  if (recStarting) await recStarting
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    console.error('[capaz] Stop recibido pero no hay grabación activa — reseteando')
    window.capaz.dismiss()
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
      console.log(`[capaz] Enviando ${buffer.byteLength} bytes de audio`)
      await window.capaz.sendAudio(buffer)
      resolve()
    }
    mediaRecorder!.stop()
  })
}

// ── IPC listeners ─────────────────────────────────────
window.capaz.onState((state) => {
  console.log('[capaz] Estado:', state)
  setWidgetState(state)
  if (state === 'listening') recStarting = startRecording()
})

window.capaz.onStopRecording(() => {
  stopAndSend()
})

window.capaz.onAnswer((payload) => {
  answerEl.textContent = payload.answer
  debugEl.textContent = `↑${payload.tokensIn} ↓${payload.tokensOut} tokens`
  hintEl.textContent = payload.flow ? HINT_FLOW : HINT_DEFAULT
  parseAndRenderOptions(payload.answer, optionsContainer)
  // Durante una guía el paso no expira: espera el click del aprendiz
  if (payload.flow && dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
})

window.capaz.onError((msg) => {
  answerEl.textContent = `⚠ ${msg}`
  stateClass = 'state-speaking'
  applyClasses()
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => setWidgetState('idle'), 20_000)
})

window.capaz.onFlip((flip) => {
  flipH = flip.h
  flipV = flip.v
  applyClasses()
})

// Inicializar en idle
setWidgetState('idle')
