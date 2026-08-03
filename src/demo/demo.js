/* ═══════════════════════════════════════════════════
   J.U.D.I.S DEMO — Interactive Logic v3
   - Single page with scrolling sections
   - Companion widget follows mouse (Laura avatar)
   - Enable/Disable J.U.D.I.S via Wallet Card
   - Interactive hotkey (J + U simultaneously) for audio simulation
   - Sequential product guidance (1 -> 2 -> 3)
   - Comparison phase at the end
═══════════════════════════════════════════════════ */

;(function () {
  'use strict'

  /* ─────────────────────────────────────────────────
     PRODUCT CATALOGUE
  ───────────────────────────────────────────────── */
  const TARGETS = [
    { id: 'hdp', emoji: '🎧', name: 'Audífonos Pro',  price: '$189.990', targetIdx: 0 },
    { id: 'cam', emoji: '📷', name: 'Cámara 4K',      price: '$649.990', targetIdx: 1 },
    { id: 'gpd', emoji: '🎮', name: 'Gamepad Pro',    price: '$89.990',  targetIdx: 2 },
  ]

  const DISTRACTORS = [
    {emoji:'💻',name:'Laptop UltraSlim',price:'$899.990'},
    {emoji:'🖥️',name:'Monitor 4K 27"', price:'$459.990'},
    {emoji:'🖱️',name:'Mouse Ergo',     price:'$49.990'},
    {emoji:'⌨️',name:'Teclado Mec.',   price:'$129.990'},
    {emoji:'📱',name:'Smartphone X12', price:'$799.990'},
    {emoji:'🔌',name:'Hub USB-C 7en1', price:'$39.990'},
    {emoji:'🔋',name:'Powerbank 20k',  price:'$34.990'},
    {emoji:'💿',name:'SSD 1TB NVMe',   price:'$119.990'},
    {emoji:'🖨️',name:'Impresora L.',  price:'$249.990'},
    {emoji:'📡',name:'Router WiFi 6',  price:'$179.990'},
    {emoji:'🎙️',name:'Micrófono USB', price:'$99.990'},
    {emoji:'📹',name:'Webcam HD',      price:'$79.990'},
    {emoji:'💡',name:'Luz LED',        price:'$29.990'},
    {emoji:'🔊',name:'Parlante BT',    price:'$69.990'},
    {emoji:'📺',name:'Smart TV 50"',   price:'$399.990'},
    {emoji:'🕹️',name:'Joystick',      price:'$59.990'},
    {emoji:'📀',name:'Disco Duro 4TB', price:'$89.990'},
    {emoji:'🧲',name:'Soporte Mag.',   price:'$19.990'},
    {emoji:'🔋',name:'Baterías rec.',  price:'$14.990'},
    {emoji:'🔌',name:'Cargador Rápido',price:'$24.990'},
    {emoji:'⌚',name:'Smartwatch S5',  price:'$299.990'},
    {emoji:'🎵',name:'DAC Portátil',   price:'$149.990'},
    {emoji:'🔑',name:'USB 256GB',      price:'$22.990'},
    {emoji:'📷',name:'Trípode Flex.',  price:'$27.990'},
    {emoji:'🌐',name:'Switch 8p',      price:'$69.990'},
    {emoji:'🔐',name:'Llave U2F',      price:'$49.990'},
    {emoji:'🎚️',name:'Mezclador',     price:'$189.990'},
    {emoji:'📲',name:'Soporte Art.',   price:'$34.990'},
    {emoji:'🧤',name:'Guante VR',      price:'$229.990'},
  ]

  /* ─────────────────────────────────────────────────
     STATE VARIABLES
  ───────────────────────────────────────────────── */
  let chrono1 = { interval: null, ms: 0, running: false }
  let chrono2 = { interval: null, ms: 0, running: false }
  let found1 = new Set()
  let found2 = new Set()
  let isJudisEnabled = false
  let guideStep = 0
  let companionState = 'idle' // idle, listening, thinking, speaking

  // Mobile drag-to-reposition state
  let hasCustomMobilePosition = false
  let isDraggingCompanion = false
  let dragMoveDetected = false
  let dragStartX = 0
  let dragStartY = 0
  let recordingCancelledByDrag = false
  const DRAG_MOVE_THRESHOLD = 10

  // Mouse tracking
  let mouseX = window.innerWidth - 100
  let mouseY = window.innerHeight - 100
  const COMPANION_OFFSET_X = 15
  const COMPANION_OFFSET_Y = 15

  // Audio recording simulation variables
  let mediaRecorder = null
  let audioChunks = []
  let micStream = null
  let isHotkeyActive = false
  let keysPressed = {}

  /* ─────────────────────────────────────────────────
     SUPABASE ANALYTICS TRACKING
  ───────────────────────────────────────────────── */
  const SUPABASE_URL = 'https://pfuifebtpslzksuwcsxh.supabase.co'
  const SUPABASE_ANON_KEY = 'sb_publishable_6cek6h4_R1SeDniV2Dmxvg_hMq3Gh-Z'

  let sessionId = sessionStorage.getItem('judis_session_id')
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    sessionStorage.setItem('judis_session_id', sessionId)
  }

  let sessionQuestions = []
  let sessionSeconds = 0

  async function saveAnalytics(data) {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
      return
    }
    const url = `${SUPABASE_URL}/rest/v1/judis_analytics?on_conflict=session_id`
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          session_id: sessionId,
          last_active_at: new Date().toISOString(),
          ...data
        })
      })
    } catch (e) {
      console.warn('[J.U.D.I.S Analytics] Failed to send log:', e)
    }
  }

  // Initial session registration
  const isMobileDevice = window.innerWidth <= 600 || /Mobi|Android|iPhone/i.test(navigator.userAgent)
  saveAnalytics({
    device_type: isMobileDevice ? 'mobile' : 'desktop',
    user_agent: navigator.userAgent,
    max_section: 1,
    total_time_seconds: 0
  })

  // Time tracker ping interval (runs every 5 seconds)
  setInterval(() => {
    sessionSeconds += 5
    saveAnalytics({
      total_time_seconds: sessionSeconds
    })
  }, 5000)

  /* ─────────────────────────────────────────────────
     TIME FORMAT UTILS
  ───────────────────────────────────────────────── */
  function fmtTime(ms) {
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
  }

  function fmtSecs(ms) {
    return `${(ms / 1000).toFixed(1)}s`
  }

  function normalizeText(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
  }

  /* ─────────────────────────────────────────────────
     PRODUCT GRIDS GENERATION
  ───────────────────────────────────────────────── */
  function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function buildGrid(gridId, isRound2) {
    const gridEl = document.getElementById(gridId)
    if (!gridEl) return
    gridEl.innerHTML = ''
    const allProducts = shuffle([...TARGETS, ...DISTRACTORS])

    allProducts.forEach(product => {
      const card = document.createElement('div')
      card.className = 'product-card'
      card.dataset.id = product.id || ''
      card.innerHTML = `
        <span class="p-emoji">${product.emoji}</span>
        <div class="p-name">${product.name}</div>
        <div class="p-price">${product.price}</div>
      `
      card.addEventListener('click', () => {
        if (isRound2) {
          handleCardClick2(card, product)
        } else {
          handleCardClick1(card, product)
        }
      })
      gridEl.appendChild(card)
    })
  }

  /* ─────────────────────────────────────────────────
     ROUND 1 CLICKS
  ───────────────────────────────────────────────── */
  function handleCardClick1(card, product) {
    if (!chrono1.running) return
    const isTarget = TARGETS.some(t => t.id === product.id)
    if (!isTarget) {
      triggerCardShake(card)
      return
    }
    if (found1.has(product.id)) return

    card.classList.add('found-item')
    found1.add(product.id)

    const targetDetails = TARGETS.find(t => t.id === product.id)
    const badge = document.getElementById(`tb-${targetDetails.targetIdx}`)
    if (badge) badge.classList.add('found')

    document.getElementById('found-1').textContent = found1.size

    if (found1.size === 3) {
      stopChrono(1)
      saveAnalytics({
        max_section: 2,
        ronda1_time: Math.round(chrono1.ms / 1000)
      })
      setTimeout(() => {
        document.getElementById('time-1').textContent = fmtSecs(chrono1.ms)
        const secResult1 = document.getElementById('sec-result1')
        const secActivate = document.getElementById('sec-activate')
        if (secResult1) secResult1.classList.remove('hidden-sec')
        if (secActivate) secActivate.classList.remove('hidden-sec')
        // Scroll smoothly to next step
        secResult1.scrollIntoView({ behavior: 'smooth' })
      }, 500)
    }
  }

  /* ─────────────────────────────────────────────────
     ROUND 2 CLICKS (WITH J.U.D.I.S)
  ───────────────────────────────────────────────── */
  function handleCardClick2(card, product) {
    if (!chrono2.running) return
    const isTarget = TARGETS.some(t => t.id === product.id)
    if (!isTarget) {
      triggerCardShake(card)
      return
    }
    if (found2.has(product.id)) return

    card.classList.add('found-item')
    // Remove hotspot overlays
    card.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())
    found2.add(product.id)

    const targetDetails = TARGETS.find(t => t.id === product.id)
    const badge = document.getElementById(`tb2-${targetDetails.targetIdx}`)
    if (badge) badge.classList.add('found')

    document.getElementById('found-2').textContent = found2.size
    guideStep++

    if (found2.size < 3) {
      setTimeout(() => triggerSequentialGuide(), 600)
    } else {
      stopChrono(2)
      saveAnalytics({
        max_section: 4,
        ronda2_time: Math.round(chrono2.ms / 1000)
      })
      updateCompanionState('speaking')
      updateCompanionBubble('¡Increíble! Has encontrado todos los productos con mi ayuda. 😊')
      setTimeout(() => {
        const secFinal = document.getElementById('sec-final')
        if (secFinal) secFinal.classList.remove('hidden-sec')
        showFinalMetrics()
        secFinal.scrollIntoView({ behavior: 'smooth' })
      }, 1500)
    }
  }

  function triggerCardShake(card) {
    card.classList.add('wrong-click')
    setTimeout(() => card.classList.remove('wrong-click'), 400)
  }

  /* ─────────────────────────────────────────────────
     CHRONOMETER LOGIC
  ───────────────────────────────────────────────── */
  function startChrono(n) {
    const chronoState = n === 1 ? chrono1 : chrono2
    if (chronoState.running) return
    chronoState.running = true
    chronoState.ms = 0

    const displayEl = document.getElementById(`chrono-${n}`)
    const buttonEl = document.getElementById(`btn-start-${n}`)
    if (displayEl) displayEl.classList.add('running')
    if (buttonEl) {
      buttonEl.innerHTML = '<span>⏸</span> Corriendo...'
      buttonEl.classList.add('disabled')
    }

    const t0 = Date.now()
    chronoState.interval = setInterval(() => {
      chronoState.ms = Date.now() - t0
      if (displayEl) displayEl.textContent = fmtTime(chronoState.ms)
    }, 80)
  }

  function stopChrono(n) {
    const chronoState = n === 1 ? chrono1 : chrono2
    if (!chronoState.running) return
    chronoState.running = false
    clearInterval(chronoState.interval)
    const displayEl = document.getElementById(`chrono-${n}`)
    if (displayEl) displayEl.classList.remove('running')
  }

  /* ─────────────────────────────────────────────────
     COMPANION FLOATING POSITIONING
  ───────────────────────────────────────────────── */
  const companionEl = document.getElementById('companion')

  document.addEventListener('mousemove', (e) => {
    if (!isJudisEnabled) return
    mouseX = e.clientX
    mouseY = e.clientY
    updateCompanionPosition(mouseX, mouseY)
  })

  function updateCompanionPosition(x, y) {
    if (!companionEl) return
    if (window.innerWidth <= 600) {
      // Once the user has dragged the companion on mobile, keep that spot
      // instead of snapping back to the default CSS position.
      if (!hasCustomMobilePosition) {
        companionEl.style.left = ''
        companionEl.style.top = ''
        companionEl.style.bottom = ''
        companionEl.style.right = ''
      }
      return
    }
    const compWidth = companionEl.offsetWidth || 60
    const compHeight = companionEl.offsetHeight || 60
    const viewWidth = window.innerWidth
    const viewHeight = window.innerHeight

    let targetLeft = x + COMPANION_OFFSET_X
    let targetTop = y + COMPANION_OFFSET_Y

    // Bounds checking to prevent companion overflow
    if (targetLeft + compWidth > viewWidth - 10) {
      targetLeft = x - compWidth - COMPANION_OFFSET_X
    }
    if (targetTop + compHeight > viewHeight - 10) {
      targetTop = y - compHeight - COMPANION_OFFSET_Y
    }

    companionEl.style.left = `${Math.max(5, targetLeft)}px`
    companionEl.style.top = `${Math.max(5, targetTop)}px`
    companionEl.style.bottom = 'auto'
    companionEl.style.right = 'auto'
  }

  // Moves the companion to follow a touch/mouse point on mobile, anchoring
  // from whichever screen edge (left/right) is closest so it never runs
  // off-screen, and flips the bubble to the opposite side of the orb.
  function positionCompanionMobile(x, y) {
    if (!companionEl) return
    const orbEl = companionEl.querySelector('.comp-orb')
    const orbSize = (orbEl && orbEl.offsetWidth) || 56
    const margin = 8
    const isRightSide = x > window.innerWidth / 2

    hasCustomMobilePosition = true
    companionEl.style.transform = 'none'
    companionEl.style.top = `${Math.max(margin, Math.min(y - orbSize / 2, window.innerHeight - orbSize - margin))}px`
    companionEl.style.bottom = 'auto'

    if (isRightSide) {
      companionEl.style.right = `${Math.max(margin, window.innerWidth - x - orbSize / 2)}px`
      companionEl.style.left = 'auto'
    } else {
      companionEl.style.left = `${Math.max(margin, x - orbSize / 2)}px`
      companionEl.style.right = 'auto'
    }

    companionEl.classList.toggle('side-right', isRightSide)
  }

  function enableJudisCompanion() {
    isJudisEnabled = true
    if (companionEl) {
      companionEl.classList.remove('off')
      companionEl.classList.add('following')
      updateCompanionState('idle')
      updateCompanionPosition(mouseX, mouseY)
    }
  }

  function disableJudisCompanion() {
    isJudisEnabled = false
    if (companionEl) {
      companionEl.classList.add('off')
      companionEl.classList.remove('following')
    }
  }

  /* ─────────────────────────────────────────────────
     COMPANION STATE MANAGEMENT
     - idle (normal)
     - listening (recording red)
     - thinking (processing orange)
     - speaking (green status, text bubble showing)
  ───────────────────────────────────────────────── */
  function updateCompanionState(state) {
    companionState = state
    if (!companionEl) return

    companionEl.className = `companion following state-${state}`
    const pillTxt = companionEl.querySelector('.comp-pill-txt')

    const statusTexts = {
      idle: '',
      listening: '🎙️ Grabando...',
      thinking: '⟳ Procesando...',
      speaking: ''
    }

    if (pillTxt) pillTxt.textContent = statusTexts[state] || ''

    // Toggle bubble close buttons visibility
    const btnWeb = document.getElementById('btn-close-bubble-web')
    const btnMobile = document.getElementById('btn-close-bubble-mobile')
    if (state === 'speaking') {
      if (btnWeb) btnWeb.classList.add('visible')
      if (btnMobile) btnMobile.classList.add('visible')
    } else {
      if (btnWeb) btnWeb.classList.remove('visible')
      if (btnMobile) btnMobile.classList.remove('visible')
    }
  }

  function hideSpeechBubble() {
    const bubble = companionEl ? companionEl.querySelector('.comp-bubble') : null
    if (bubble) bubble.classList.add('hidden')
    updateCompanionState('idle')
  }

  function updateCompanionBubble(text) {
    if (!companionEl) return
    const bubble = companionEl.querySelector('.comp-bubble')
    const answer = companionEl.querySelector('.comp-answer')
    const hint = companionEl.querySelector('.comp-hint')

    if (text) {
      if (bubble) bubble.classList.remove('hidden')
      if (answer) answer.innerHTML = text
      if (hint) hint.textContent = 'J + U para hablar'
    } else {
      if (bubble) bubble.classList.add('hidden')
    }
  }

  /* ─────────────────────────────────────────────────
     SEQUENTIAL PRODUCT GUIDANCE (1 -> 2 -> 3)
  ───────────────────────────────────────────────── */
  function triggerSequentialGuide() {
    if (guideStep >= 3) return
    const targetProduct = TARGETS[guideStep]
    const gridEl = document.getElementById('grid-2')
    if (!gridEl) return

    // Clear previous hotspots
    gridEl.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())

    // Find target product card in grid
    const cards = gridEl.querySelectorAll('.product-card')
    let matchedCard = null
    cards.forEach(card => {
      const pName = card.querySelector('.p-name')
      if (pName && pName.textContent.trim() === targetProduct.name) {
        matchedCard = card
      }
    })

    if (!matchedCard) return

    // Append visual guidance overlays
    matchedCard.style.position = 'relative'
    matchedCard.style.zIndex = '10'

    const ring = document.createElement('div')
    ring.className = 'hotspot-ring'
    matchedCard.appendChild(ring)

    const ring2 = document.createElement('div')
    ring2.className = 'hotspot-ring-2'
    matchedCard.appendChild(ring2)

    const label = document.createElement('div')
    label.className = 'hotspot-label'
    label.textContent = `✦ Encontrar: ${targetProduct.name}`
    matchedCard.appendChild(label)

    const arrow = document.createElement('div')
    arrow.className = 'hotspot-arrow'
    arrow.textContent = '👇'
    matchedCard.appendChild(arrow)

    // Smoothly scroll matched target into view
    setTimeout(() => {
      matchedCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)

    // Update J.U.D.I.S text bubble explanation
    const msg = `Señalé el producto en pantalla: <strong>${targetProduct.emoji} ${targetProduct.name}</strong>. Haz clic para avanzar.`
    updateCompanionBubble(msg)
  }

  /* ─────────────────────────────────────────────────
     AUDIO RECORDING SIMULATION (J + U Keys)
  ───────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────
     AUDIO RECORDING AND REAL SPEECH RECOGNITION
  ───────────────────────────────────────────────── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  // Every browser on iOS (Safari, Chrome, etc.) is required by Apple to run
  // on WebKit's engine, including its SpeechRecognition implementation —
  // and that implementation has a real, unfixable-from-JS bug where a
  // continuous-mode session's abort()/stop() doesn't release the
  // microphone hardware, leaving the recording indicator lit forever. No
  // amount of cleanup on our side changes that, so real recognition is
  // skipped entirely on iOS in favor of the simulated/guided flow below,
  // which drives the mic via a plain getUserMedia + MediaRecorder stream
  // we can reliably stop ourselves.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  let recognition = null
  let receivedSpeechResult = false
  let accumulatedTranscript = ''
  let recordingStartTime = 0
  let micPermissionGranted = false
  let lastRecognitionEndedAt = 0
  let recognitionStartedThisSession = false
  let recognitionRestartCount = 0
  let recognitionFatalError = false
  // Some browsers (seen on iOS Safari) expose window.SpeechRecognition but
  // the underlying speech service itself always refuses with
  // 'service-not-allowed', regardless of mic/dictation/language settings —
  // a platform limitation, not something a retry can fix. Once we see it,
  // stop attempting real recognition for the rest of the session and fall
  // back to the simulated/guided flow instead of repeating the same error.
  let speechServiceUnavailable = false
  const MAX_RECOGNITION_RESTARTS = 4

  function logLine(text) {
    return `<div class="comp-log">🪵 ${text}</div>`
  }

  // While the user is still holding the talk button, a session that ends
  // with nothing captured almost always means the native engine's own
  // silence timeout closed it before they started speaking (very common on
  // iOS if there's a beat of silence right after pressing). In that case we
  // want to seamlessly open a new session rather than surface a failure —
  // from the user's perspective they're still mid hold-to-talk.
  function canAutoRestart() {
    return isHotkeyActive &&
      companionState === 'listening' &&
      !receivedSpeechResult &&
      !recognitionFatalError &&
      recognitionRestartCount < MAX_RECOGNITION_RESTARTS
  }

  function beginRecognitionSession() {
    // The button may have already been released (or iOS interrupted the
    // touch with a cancel while the permission dialog was up) by the time
    // this runs — starting a session now would open a mic nothing will
    // ever stop, which is what left the mic indicator lit forever on iOS
    // Safari after release.
    if (!isHotkeyActive) return

    // A previous session may still be lingering here — most commonly the
    // auto-restart path (see canAutoRestart/onend below) replacing a
    // session whose onstart/onend never fired, a known iOS Safari
    // SpeechRecognition flakiness. Left alone, that orphaned instance keeps
    // holding the microphone forever since nothing else references it once
    // `recognition` is reassigned below. Detach its handlers (so its own
    // abort doesn't trigger onerror/onend logic meant for the *new*
    // session) and abort it before moving on.
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.abort() } catch (e) {}
    }

    recognition = createRecognition()
    try {
      recognition.start()
    } catch (e) {
      console.warn('SpeechRecognition failed to start:', e)
      isHotkeyActive = false
      updateCompanionState('speaking')
      updateCompanionBubble('No pude activar el micrófono, intenta de nuevo 🎙️')
    }
  }

  // Builds a fresh recognizer for every recording. Reusing one long-lived
  // instance across presses is flaky on real mobile browsers — a second
  // .start() shortly after the previous session ended can silently fail to
  // actually listen (the native recognizer session doesn't fully tear
  // down), so subsequent attempts just time out with no result.
  function createRecognition() {
    const rec = new SpeechRecognition()
    // Continuous mode keeps listening for as long as the button is held,
    // instead of auto-stopping after the first detected phrase/pause — that
    // single-utterance mode (continuous=false) was cutting people off (or
    // producing zero transcript) whenever they took more than a couple
    // seconds to speak. We finalize manually via recognition.stop() on
    // release; see stopAndProcessRecording.
    rec.continuous = true
    rec.interimResults = false
    // 'es-419' (generic Latin America) isn't a real locale Apple's on-device
    // dictation engine recognizes, so iOS Safari/Chrome silently returns no
    // transcript for every session — it only "worked" in testing on Chrome
    // desktop because that uses Google's cloud speech backend instead.
    rec.lang = 'es-MX'

    rec.onstart = () => {
      micPermissionGranted = true
      recognitionStartedThisSession = true
    }

    rec.onresult = (event) => {
      receivedSpeechResult = true
      // In continuous mode, event.results holds every final phrase captured
      // so far this session (not just the newest one) — join them all into
      // one transcript rather than assuming index 0 is the whole utterance.
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      accumulatedTranscript = transcript.trim()
      console.log('[J.U.D.I.S Speech] Transcript so far:', accumulatedTranscript)
    }

    rec.onerror = (event) => {
      console.warn('[J.U.D.I.S Speech] Error:', event.error)
      if (recordingCancelledByDrag) {
        recordingCancelledByDrag = false
        return
      }
      if (recordingAbortedByFailsafe) {
        recordingAbortedByFailsafe = false
        return
      }
      if (recordingEndedOnRelease) {
        recordingEndedOnRelease = false
        return
      }
      const isPermissionError = event.error === 'not-allowed'
      const isServiceUnavailable = event.error === 'service-not-allowed'
      if (isPermissionError || isServiceUnavailable) recognitionFatalError = true

      // The speech *service* itself refusing (as opposed to the user
      // denying mic access) isn't something asking again will ever fix on
      // this browser — stop trying real recognition for the rest of the
      // session and quietly continue the demo via the simulated flow.
      if (isServiceUnavailable) {
        speechServiceUnavailable = true
        console.warn('[J.U.D.I.S Speech] service-not-allowed — disabling real recognition for this session.')
        isHotkeyActive = false
        if (thinkingTimeout) {
          clearTimeout(thinkingTimeout)
          thinkingTimeout = null
        }
        reportRecordingFailure('el servicio de voz de este navegador no está disponible')
        return
      }

      // A bare 'no-speech' timeout while the button is still held is exactly
      // the case onend will seamlessly restart from — don't flash an error
      // the user will never actually need to act on.
      if (!isPermissionError && canAutoRestart()) return

      const elapsed = ((Date.now() - recordingStartTime) / 1000).toFixed(1)
      updateCompanionState('speaking')
      if (isPermissionError) {
        updateCompanionBubble('Por favor, permite el acceso al micrófono en la barra de tu navegador para poder hablarme.' + logLine(`error: ${event.error} · mic iniciado: ${recognitionStartedThisSession}`))
      } else {
        updateCompanionBubble(`No te escuché nada, intenta de nuevo 🎙️` + logLine(`error: ${event.error} · duración: ${elapsed}s · intentos: ${recognitionRestartCount} · mic iniciado: ${recognitionStartedThisSession}`))
      }
    }

    rec.onend = () => {
      lastRecognitionEndedAt = Date.now()

      // Session actually captured something — finalize it now that we know
      // no more results are coming, regardless of how long the hold lasted.
      if (receivedSpeechResult && accumulatedTranscript) {
        processSpokenCommand(accumulatedTranscript)
        return
      }

      if (canAutoRestart()) {
        recognitionRestartCount++
        console.warn(`[J.U.D.I.S Speech] No result yet, auto-restarting (attempt ${recognitionRestartCount})`)
        setTimeout(beginRecognitionSession, 350)
        return
      }

      // If we stopped but didn't receive any speech transcription
      setTimeout(() => {
        if (companionState === 'listening' || companionState === 'thinking') {
          if (!receivedSpeechResult) {
            const elapsed = ((Date.now() - recordingStartTime) / 1000).toFixed(1)
            updateCompanionState('speaking')
            updateCompanionBubble(
              '<div class="comp-heard">⚠️ No detecté ninguna palabra</div>Intenta de nuevo, hablando un poco más fuerte 🎙️' +
              logLine(`sin error nativo · duración: ${elapsed}s · intentos: ${recognitionRestartCount} · mic iniciado: ${recognitionStartedThisSession}`)
            )
          }
        }
      }, 1800)
    }

    return rec
  }

  async function startRecording() {
    if (isHotkeyActive) return
    isHotkeyActive = true
    receivedSpeechResult = false
    accumulatedTranscript = ''
    recognitionStartedThisSession = false
    recognitionRestartCount = 0
    recognitionFatalError = false
    recordingStartTime = Date.now()
    updateCompanionState('listening')

    // Check if browser context allows microphone/speech access (HTTPS or localhost)
    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (!isSecure) {
      updateCompanionBubble('🎙️ Escuchando... (Simulado por conexión local HTTP)');
      return;
    }

    const canUseRealRecognition = SpeechRecognition && !speechServiceUnavailable && !isIOS

    if (!canUseRealRecognition) {
      // Either this is iOS (see isIOS above for why real recognition is
      // never used there), this browser doesn't expose the Web Speech API
      // at all, or we already learned this session that the speech service
      // refuses to engage. We can still capture audio via MediaRecorder
      // below, but there is no real transcription available in that path —
      // say so up front instead of showing "Escuchando..." as if voice
      // recognition were about to kick in.
      const reason = isIOS
        ? 'reconocimiento de voz real no disponible en iOS'
        : SpeechRecognition
          ? 'el servicio de reconocimiento de voz de este navegador no está disponible'
          : 'SpeechRecognition no disponible en este navegador'
      updateCompanionBubble('🎙️ Escuchando (modo simulado)' + logLine(reason))
    } else {
      updateCompanionBubble('Escuchando...')
    }

    if (canUseRealRecognition) {
      // iOS Safari sometimes never shows the mic permission dialog when
      // SpeechRecognition.start() is called directly — explicitly
      // requesting getUserMedia first reliably forces/confirms the system
      // prompt. Once granted, this resolves instantly on later presses, so
      // it's cheap to always do.
      if (!micPermissionGranted) {
        try {
          const primerStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          primerStream.getTracks().forEach(t => t.stop())
        } catch (err) {
          console.warn('Mic permission priming failed:', err)
          isHotkeyActive = false
          updateCompanionState('speaking')
          updateCompanionBubble(
            'No pude acceder al micrófono. Revisa los permisos del sitio en Ajustes > Safari.' +
            logLine(`getUserMedia error: ${err && err.name ? err.name : err}`)
          )
          return
        }
      }

      // On iOS the native permission dialog interrupts the in-progress touch
      // (fires touchcancel), which already stopped the recording via
      // stopAndProcessRecording before the user even answered the prompt.
      // Don't start a session for a button that's no longer held.
      if (!isHotkeyActive) return

      // Once permission has been granted at least once, leave a short gap
      // since the previous session ended before restarting — starting a new
      // native recognizer session too soon after the last one is a common
      // cause of the "goes silent" behavior on real devices.
      const cooldownRemaining = micPermissionGranted
        ? Math.max(0, 350 - (Date.now() - lastRecognitionEndedAt))
        : 0

      if (cooldownRemaining > 0) {
        setTimeout(beginRecognitionSession, cooldownRemaining)
      } else {
        beginRecognitionSession()
      }
    } else {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (!isHotkeyActive) {
          micStream.getTracks().forEach(t => t.stop())
          micStream = null
          return
        }
        const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? { mimeType: 'audio/webm;codecs=opus' } : {}
        mediaRecorder = new MediaRecorder(micStream, opts)
        audioChunks = []
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
        mediaRecorder.start(100)
      } catch (err) {
        console.warn('Microphone access not allowed or unavailable. Simulating audio capture.', err)
        updateCompanionBubble(
          '🎙️ No pude acceder al micrófono' +
          logLine(`getUserMedia error: ${err && err.name ? err.name : err}`)
        )
      }
    }
  }

  let thinkingTimeout = null
  let recordingAbortedByFailsafe = false
  let recordingEndedOnRelease = false

  function stopAndProcessRecording() {
    if (!isHotkeyActive) return
    isHotkeyActive = false
    updateCompanionState('thinking')

    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (thinkingTimeout) clearTimeout(thinkingTimeout)

    // Failsafe: if SpeechRecognition hangs on mobile (very common in iOS), fallback to simulation after 4.5 seconds
    thinkingTimeout = setTimeout(() => {
      if (companionState === 'thinking' && !receivedSpeechResult) {
        console.warn('[J.U.D.I.S Speech] Failsafe triggered: SpeechRecognition hung.')
        if (recognition) {
          recordingAbortedByFailsafe = true
          try { recognition.abort() } catch (e) {}
        }
        reportRecordingFailure('se abortó la grabación, tardó demasiado en responder')
      }
    }, 4500)

    if (!isSecure) {
      setTimeout(reportRecordingFailure, 1000)
      return;
    }

    if (recognition) {
      const isMobile = window.innerWidth <= 600
      setTimeout(() => {
        try {
          // abort() (not stop()) — on iOS Safari, stop() was leaving the
          // mic indicator lit indefinitely after release even once
          // recognition had nothing left to say. abort() releases the
          // microphone immediately; any speech already transcribed via
          // onresult up to this point is preserved in accumulatedTranscript
          // regardless, so this doesn't lose an already-captured command.
          recordingEndedOnRelease = true
          recognition.abort()
        } catch (e) {
          console.warn('SpeechRecognition stop failed', e)
          reportRecordingFailure('no se pudo detener la grabación correctamente')
        }
      }, isMobile ? 1000 : 400)
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
          if (micStream) {
            micStream.getTracks().forEach(t => t.stop())
            micStream = null
          }
          mediaRecorder = null
          reportRecordingFailure()
        }
        mediaRecorder.stop()
      } else {
        setTimeout(reportRecordingFailure, 1000)
      }
    }
  }

  // Silently discards an in-progress recording when a hold-to-talk touch
  // turns out to be a drag, without surfacing the "no escuché nada" fallback.
  function cancelRecordingForDrag() {
    if (!isHotkeyActive) return
    isHotkeyActive = false
    recordingCancelledByDrag = true
    if (thinkingTimeout) {
      clearTimeout(thinkingTimeout)
      thinkingTimeout = null
    }
    if (recognition) {
      try { recognition.abort() } catch (e) {}
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop() } catch (e) {}
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop())
        micStream = null
      }
      mediaRecorder = null
    }
    hideSpeechBubble()
  }

  function processSpokenCommand(transcript) {
    sessionQuestions.push(transcript)
    saveAnalytics({
      questions: sessionQuestions
    })
    updateCompanionState('speaking')
    const text = normalizeText(transcript)
    const heard = `<div class="comp-heard">🎧 Te escuché decir: "<em>${transcript}</em>"</div>`

    if (text.includes('agendar') || text.includes('llamada') || text.includes('reunion') || text.includes('cita')) {
      updateCompanionBubble(heard + '¡Entendido! Señalé el botón de <strong>"Agendar"</strong> en la pantalla. Haz clic allí para programar nuestra llamada. 📅')
      highlightScheduleButton()
    } else if (text.includes('beneficio') || text.includes('ventajas') || text.includes('funcion') || text.includes('funciones') || text.includes('para que sirve') || text.includes('que es esto') || text.includes('que es judis') || text.includes('que eres') || text.includes('que haces') || text.includes('quien eres')) {
      updateCompanionBubble(heard + 'Soy un asistente que te ayuda a finalizar las acciones de usuarios en tu página, tipo guiarte en una compra o solucionar dudas complejas sin fricciones. 🚀')
    } else if (text.includes('ayud') || text.includes('objeto') || text.includes('producto') || text.includes('mostrar') || text.includes('buscar') || text.includes('guiar') || text.includes('iniciar') || text.includes('comenzar') || text.includes('detectar')) {
      updateCompanionBubble(heard + '¡Perfecto! Te guiaré secuencialmente para encontrar los 3 productos en la pantalla. 🚀')
      setTimeout(() => {
        if (!chrono2.running) {
          startChrono(2)
        }
        guideStep = 0
        triggerSequentialGuide()
      }, 1500)
    } else {
      const msg = heard + 'Debes decir <strong>"ayuda"</strong> para que te ayude a encontrar los objetos. 😊'
      updateCompanionBubble(msg);
    }
  }

  // Reports that a recording attempt failed to capture/process real speech.
  // Deliberately does NOT advance the guide or pretend anything was
  // understood — only a real transcribed "ayuda" (see processSpokenCommand)
  // is allowed to trigger the guided flow.
  function reportRecordingFailure(errorReason) {
    updateCompanionState('speaking')
    const elapsed = ((Date.now() - recordingStartTime) / 1000).toFixed(1)
    const detail = errorReason ? `No pude grabarte: ${errorReason}` : 'No te escuché'
    updateCompanionBubble(
      `<div class="comp-heard">⚠️ ${detail}</div>Intenta de nuevo y decime <strong>"ayuda"</strong> 🎙️` +
      logLine(`duración: ${elapsed}s · intentos: ${recognitionRestartCount} · mic iniciado: ${recognitionStartedThisSession}`)
    )
  }

  function highlightScheduleButton() {
    const secFinal = document.getElementById('sec-final')
    const isFinalVisible = secFinal && !secFinal.classList.contains('hidden-sec')
    
    // Target button: either the final CTA or the header nav button
    const targetBtn = isFinalVisible 
      ? document.getElementById('btn-schedule-meeting') 
      : (document.querySelector('#sec-luzia .nav-schedule') || document.querySelector('.nav-schedule'))
    
    if (!targetBtn) return

    // Clear previous hotspots
    document.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())

    targetBtn.style.position = 'relative'
    
    const ring = document.createElement('div')
    ring.className = 'hotspot-ring'
    targetBtn.appendChild(ring)

    const label = document.createElement('div')
    label.className = 'hotspot-label'
    if (isFinalVisible) {
      label.style.top = '-38px'
    } else {
      label.style.top = '40px'
    }
    label.textContent = '✦ Haz clic aquí para agendar'
    targetBtn.appendChild(label)

    const arrow = document.createElement('div')
    arrow.className = 'hotspot-arrow'
    if (isFinalVisible) {
      arrow.style.top = '-16px'
      arrow.style.transform = 'translateX(-50%)'
    } else {
      arrow.style.top = '18px'
      arrow.style.transform = 'translateX(-50%) rotate(180deg)'
    }
    arrow.textContent = '👆'
    targetBtn.appendChild(arrow)

    // Scroll target button into view
    targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Auto dismiss highlighting after 8 seconds
    setTimeout(() => {
      ring.remove()
      label.remove()
      arrow.remove()
    }, 8000)
  }

  function toggleJudis() {
    const pills = document.querySelectorAll('.luzia-pill-nav')
    
    if (isJudisEnabled) {
      // DEACTIVATE
      isJudisEnabled = false
      disableJudisCompanion()

      pills.forEach(pill => {
        const dot = pill.querySelector('.luzia-dot-on') || pill.querySelector('.luzia-dot-off')
        if (dot) dot.className = 'luzia-dot-off'
        const txt = pill.querySelector('span:last-child')
        if (txt) txt.textContent = 'J.U.D.I.S inactiva'
      })

      // Revert wallet card state
      if (walletCardEl) walletCardEl.classList.remove('enabled')
      if (enableLuziaBtn) enableLuziaBtn.textContent = 'Sí, habilitar'

      // Hide hotspots
      const gridEl = document.getElementById('grid-2')
      if (gridEl) {
        gridEl.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())
      }

      // Stop chrono 2 if running
      if (chrono2.interval) {
        clearInterval(chrono2.interval)
      }
      chrono2 = { interval: null, ms: 0, running: false }
      document.getElementById('chrono-2').textContent = '00:00.0'
      document.getElementById('chrono-2').classList.remove('running')
      
      const c2Btn = document.getElementById('btn-start-2')
      if (c2Btn) {
        c2Btn.innerHTML = '<span>▶</span> Iniciar con J.U.D.I.S'
        c2Btn.classList.remove('disabled')
      }
    } else {
      // ACTIVATE
      isJudisEnabled = true
      enableJudisCompanion()

      pills.forEach(pill => {
        const dot = pill.querySelector('.luzia-dot-off') || pill.querySelector('.luzia-dot-on')
        if (dot) dot.className = 'luzia-dot-on'
        const txt = pill.querySelector('span:last-child')
        if (txt) txt.textContent = 'J.U.D.I.S activa'
      })

      // Sync wallet card state
      if (walletCardEl) walletCardEl.classList.add('enabled')
      if (enableLuziaBtn) enableLuziaBtn.textContent = 'Habilitado'

      // Welcome J.U.D.I.S speech
      const welcomeMsg = window.innerWidth <= 600
        ? '¡Hola! Soy J.U.D.I.S. Mantén presionada mi foto para hablarme.'
        : '¡Hola! Soy J.U.D.I.S. Mantén presionadas las teclas <strong>J + U</strong> en tu teclado para hablarme.'
      updateCompanionBubble(welcomeMsg)
      updateCompanionState('speaking')
    }
  }

  // Keyboard Hotkey Listener: J (Key 74) & U (Key 85)
  document.addEventListener('keydown', (e) => {
    if (!isJudisEnabled) return
    const key = e.key.toLowerCase()
    if (key === 'j' || key === 'u') {
      keysPressed[key] = true
    }
    if (keysPressed['j'] && keysPressed['u']) {
      e.preventDefault()
      startRecording()
    }
  })

  document.addEventListener('keyup', (e) => {
    if (!isJudisEnabled) return
    const key = e.key.toLowerCase()
    if (key === 'j' || key === 'u') {
      delete keysPressed[key]
    }
    // Stop recording once either hotkey is released
    if (!keysPressed['j'] || !keysPressed['u']) {
      stopAndProcessRecording()
    }
  })

  /* ─────────────────────────────────────────────────
     FINAL RESULTS CALCULATION
  ───────────────────────────────────────────────── */
  function showFinalMetrics() {
    const t1 = chrono1.ms
    const t2 = chrono2.ms
    const ratio = t1 > 0 ? Math.round(((t1 - t2) / t1) * 100) : 0
    const pctImprovement = Math.max(0, ratio)

    document.getElementById('cmp-t1').textContent = fmtSecs(t1)
    document.getElementById('cmp-t2').textContent = fmtSecs(t2)
    document.getElementById('impact-pct').textContent = `${pctImprovement}%`

    const verb = pctImprovement >= 60 ? 'enormemente más rápido' : pctImprovement >= 30 ? 'notablemente más rápido' : 'más rápido'
    document.getElementById('impact-msg').innerHTML = `Con J.U.D.I.S tus clientes compran un <strong>${pctImprovement}%</strong> ${verb}. Menos fricción significa más conversiones.`
  }

  /* ─────────────────────────────────────────────────
     WALLET CARD ENABLE BUTTON
  ───────────────────────────────────────────────── */
  const enableLuziaBtn = document.getElementById('btn-enable-luzia')
  const walletCardEl = document.getElementById('wallet-card')

  if (enableLuziaBtn) {
    enableLuziaBtn.addEventListener('click', () => {
      if (walletCardEl) walletCardEl.classList.add('enabled')
      enableLuziaBtn.textContent = 'Habilitado'
      enableJudisCompanion()
      saveAnalytics({
        max_section: 3,
        is_luzia_enabled: true
      })

      // Inform user how to trigger J.U.D.I.S via bubble
      const welcomeMsg = window.innerWidth <= 600
        ? '¡Hola! Soy J.U.D.I.S. Mantén presionada mi foto para hablarme.'
        : '¡Hola! Soy J.U.D.I.S. Mantén presionadas las teclas <strong>J + U</strong> en tu teclado para hablarme.'
      updateCompanionBubble(welcomeMsg)
      updateCompanionState('speaking')

      // Reveal Phase 4 store grid
      const secLuzia = document.getElementById('sec-luzia')
      if (secLuzia) {
        secLuzia.classList.remove('hidden-sec')
        buildGrid('grid-2', true)
        setTimeout(() => {
          secLuzia.scrollIntoView({ behavior: 'smooth' })
        }, 300)
      }
    })
  }

  /* ─────────────────────────────────────────────────
     RESTART BUTTON
  ───────────────────────────────────────────────── */
  const restartBtn = document.getElementById('btn-restart')
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      // Reset variables
      chrono1 = { interval: null, ms: 0, running: false }
      chrono2 = { interval: null, ms: 0, running: false }
      found1 = new Set()
      found2 = new Set()
      guideStep = 0
      disableJudisCompanion()

      // Reset displays
      document.getElementById('chrono-1').textContent = '00:00.0'
      document.getElementById('chrono-2').textContent = '00:00.0'
      document.getElementById('found-1').textContent = '0'
      document.getElementById('found-2').textContent = '0'

      document.getElementById('chrono-1').classList.remove('running')
      document.getElementById('chrono-2').classList.remove('running')

      // Reset badges
      ;[0, 1, 2].forEach(i => {
        const b1 = document.getElementById(`tb-${i}`)
        const b2 = document.getElementById(`tb2-${i}`)
        if (b1) b1.classList.remove('found')
        if (b2) b2.classList.remove('found')
      })

      // Reset chrono 1 button
      const c1Btn = document.getElementById('btn-start-1')
      if (c1Btn) {
        c1Btn.innerHTML = '<span>▶</span> Iniciar cronómetro'
        c1Btn.classList.remove('disabled')
      }

      // Reset chrono 2 button
      const c2Btn = document.getElementById('btn-start-2')
      if (c2Btn) {
        c2Btn.innerHTML = '<span>▶</span> Iniciar con J.U.D.I.S'
        c2Btn.classList.remove('disabled')
      }

      // Reset Wallet Card state
      if (walletCardEl) walletCardEl.classList.remove('enabled')
      if (enableLuziaBtn) enableLuziaBtn.textContent = 'Sí, habilitar'

      // Hide conditional sections
      document.getElementById('sec-result1').classList.add('hidden-sec')
      document.getElementById('sec-activate').classList.add('hidden-sec')
      document.getElementById('sec-luzia').classList.add('hidden-sec')
      document.getElementById('sec-final').classList.add('hidden-sec')

      // Rebuild grid 1
      buildGrid('grid-1', false)
      document.getElementById('sec-hero').scrollIntoView({ behavior: 'smooth' })
    })
  }

  /* ─────────────────────────────────────────────────
     INITIALIZATION
  ───────────────────────────────────────────────── */
  function init() {
    buildGrid('grid-1', false)

    // Chrono 1 Start button
    const btn1 = document.getElementById('btn-start-1')
    if (btn1) {
      btn1.addEventListener('click', () => {
        if (!chrono1.running) startChrono(1)
      })
    }

    // Chrono 2 Start button
    const btn2 = document.getElementById('btn-start-2')
    if (btn2) {
      btn2.addEventListener('click', () => {
        if (!chrono2.running) {
          startChrono(2)
          updateCompanionState('speaking')
          const askMsg = window.innerWidth <= 600
            ? 'Mantén presionado, di <strong>"ayuda"</strong> y te ayudo a encontrar los 3 objetos.'
            : 'Presiona J+U, di <strong>"ayuda"</strong> y te ayudo a encontrar los 3 objetos.'
          updateCompanionBubble(askMsg)
        }
      })
    }

    // Avatar Press and Hold Interaction (For Mobile and Touch Support)
    const compOrbEl = companionEl ? companionEl.querySelector('.comp-orb') : null
    let lastPressTime = 0
    let isPressing = false
    if (compOrbEl) {
      // Prevent context menu on long press
      compOrbEl.addEventListener('contextmenu', (e) => e.preventDefault())

      const getEventCoords = (e) => {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
        if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
        return { x: e.clientX, y: e.clientY }
      }

      const handlePressStart = (e) => {
        if (!isJudisEnabled) return

        // Prevent back-to-back touch and mouse double-triggers within 300ms
        const now = Date.now()
        if (now - lastPressTime < 300) {
          e.preventDefault()
          return
        }
        lastPressTime = now

        e.preventDefault()
        // If already listening (e.g., got stuck during native permission dialog blur), tap again to toggle stop
        if (companionState === 'listening') {
          stopAndProcessRecording()
          return
        }

        const coords = getEventCoords(e)
        dragStartX = coords.x
        dragStartY = coords.y
        dragMoveDetected = false
        isDraggingCompanion = false
        isPressing = true

        // Start recording immediately, synchronously within this gesture —
        // some mobile browsers require mic-access APIs to be triggered
        // directly from the input event, not after a setTimeout delay.
        // A drag detected afterwards (handlePressMove) cancels it silently.
        if (companionState === 'idle' || companionState === 'speaking') {
          startRecording()
        }
      }

      const handlePressMove = (e) => {
        if (!isJudisEnabled) return
        if (!isPressing) return
        if (window.innerWidth > 600) return
        e.preventDefault()

        const coords = getEventCoords(e)
        const dx = coords.x - dragStartX
        const dy = coords.y - dragStartY

        if (!dragMoveDetected && Math.hypot(dx, dy) > DRAG_MOVE_THRESHOLD) {
          dragMoveDetected = true
          isDraggingCompanion = true
          if (isHotkeyActive) {
            cancelRecordingForDrag()
          }
        }

        if (isDraggingCompanion) {
          positionCompanionMobile(coords.x, coords.y)
        }
      }

      const handlePressEnd = (e) => {
        if (!isJudisEnabled) return
        isPressing = false
        if (e.target === compOrbEl) {
          e.preventDefault()
        }
        if (isDraggingCompanion) {
          isDraggingCompanion = false
          return
        }
        if (isHotkeyActive) {
          stopAndProcessRecording()
        }
      }

      compOrbEl.addEventListener('mousedown', handlePressStart)
      compOrbEl.addEventListener('touchstart', handlePressStart, { passive: false })
      compOrbEl.addEventListener('touchmove', handlePressMove, { passive: false })

      // Global window listeners for robust release, blur (permission prompt interrupts) and cancel events
      window.addEventListener('mousemove', handlePressMove)
      window.addEventListener('mouseup', handlePressEnd)
      window.addEventListener('touchend', handlePressEnd)
      window.addEventListener('touchcancel', handlePressEnd)
      window.addEventListener('blur', () => {
        if (isHotkeyActive) {
          const duration = Date.now() - recordingStartTime
          if (duration < 1500) {
            isHotkeyActive = false
            if (recognition) {
              try { recognition.abort() } catch(e) {}
            }
            updateCompanionState('speaking')
            updateCompanionBubble('Permiso de micrófono solicitado. Acéptalo en tu pantalla y vuelve a mantener presionado para hablarme. 🎙️')
          } else {
            stopAndProcessRecording()
          }
        }
      })
    }

    // Active pill toggling trigger
    document.querySelectorAll('.luzia-pill-nav').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault()
        toggleJudis()
      })
    })

    // Close bubble buttons event listeners
    const closeWebBtn = document.getElementById('btn-close-bubble-web')
    if (closeWebBtn) {
      closeWebBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        hideSpeechBubble()
      })
    }

    const closeMobileBtn = document.getElementById('btn-close-bubble-mobile')
    if (closeMobileBtn) {
      closeMobileBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        hideSpeechBubble()
      })
    }

    // Nav restart click handler (reloads the page)
    document.querySelectorAll('.nav-restart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        window.location.reload()
      })
    })

    // Nav schedule click handlers (redirects to scheduling link)
    document.querySelectorAll('.nav-schedule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        window.open('https://calendly.com/', '_blank')
      })
    })

    // Final card schedule button (redirects to scheduling link)
    const scheduleMeetingBtn = document.getElementById('btn-schedule-meeting')
    if (scheduleMeetingBtn) {
      scheduleMeetingBtn.addEventListener('click', (e) => {
        e.preventDefault()
        window.open('https://calendly.com/', '_blank')
      })
    }

    console.log('[J.U.D.I.S Demo] initialized successfully.')
  }

  // Go
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})()
