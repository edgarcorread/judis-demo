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
    // Remove hotspot overlays from this specific clicked card
    card.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())
    card.style.zIndex = ''
    found2.add(product.id)

    const targetDetails = TARGETS.find(t => t.id === product.id)
    const badge = document.getElementById(`tb2-${targetDetails.targetIdx}`)
    if (badge) badge.classList.add('found')

    document.getElementById('found-2').textContent = found2.size
    guideStep = found2.size

    if (found2.size < 3) {
      const remaining = 3 - found2.size
      updateCompanionState('speaking')
      updateCompanionBubble(`¡Excelente! Encontraste <strong>${targetDetails.name}</strong>. Te ${remaining === 1 ? 'queda 1 producto señalado' : 'quedan ' + remaining + ' productos señalados'}.`)
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

  // The greeting is triggered from two places (the wallet card's "Sí,
  // habilitar" button and the nav pill), so it lives in one function with a
  // guard: whichever fires first does the greeting, the other one is a no-op.
  // Reset by disableJudisCompanion so turning J.U.D.I.S off and on again
  // greets properly.
  let hasGreeted = false

  function speakWelcome() {
    if (hasGreeted) return
    hasGreeted = true
    const welcomeMsg = window.innerWidth <= 600
      ? '¡Hola! Soy J.U.D.I.S, tu acompañante online. Mantén presionado el rombo para hablarme.'
      : '¡Hola! Soy J.U.D.I.S, tu acompañante online. Mantén presionadas las teclas <strong>J + U</strong> en tu teclado para hablarme.'
    updateCompanionBubble(welcomeMsg)
    updateCompanionState('speaking')
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
    hasGreeted = false
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

  /* ─────────────────────────────────────────────────
     GOOGLE TEXT-TO-SPEECH (TTS) INTEGRATION
  ───────────────────────────────────────────────── */
  let audioCtx = null
  let currentSourceNode = null
  let currentTTSAudio = null
  let speakToken = 0
  let lastSpokenRaw = ''
  let lastSpokenAt = 0

  // Voices J.U.D.I.S speaks with, best-sounding first — every one of them
  // female. Chirp3-HD is Google's most natural family (conversational
  // intonation instead of the flatter "read-aloud" cadence of Neural2), so
  // it's what we ask for; Neural2 stays behind it as the safety net for keys
  // or regions where the HD voices aren't enabled, and the browser voice
  // behind that. Sulafat is the warm one; Leda (brighter) and Aoede
  // (breezier) are the other good female options if you want a different feel.
  const TTS_VOICE_CHAIN = [
    { name: 'es-US-Chirp3-HD-Sulafat', languageCode: 'es-US', rate: 1.0, supportsPitch: false },
    { name: 'es-US-Neural2-A', languageCode: 'es-US', rate: 1.0, supportsPitch: true }
  ]
  // When the mic was last released. Used to give iOS a beat to switch its
  // audio session back to playback before we start speaking — see
  // markMicReleased() below.
  let micReleasedAt = 0

  // Why this exists: on iOS (and to a lesser degree Android), using the
  // microphone switches the whole audio session into "play and record"
  // mode — telephony-grade, mono, heavily processed, routed out the
  // earpiece. Anything played back through an AudioContext that was
  // created (or kept alive) during that mode keeps sounding thin and
  // metallic: exactly the "suena a robot" the welcome message doesn't have,
  // because that one plays before the mic has ever been touched.
  //
  // Tearing the context down once the mic hardware is released means the
  // next speakText() builds a brand-new one, which the OS opens in plain
  // playback mode again — so every answer sounds like the first one.
  function resetAudioContext() {
    if (currentSourceNode) {
      try { currentSourceNode.stop() } catch (e) {}
      currentSourceNode = null
    }
    if (audioCtx) {
      const old = audioCtx
      audioCtx = null
      try { old.close() } catch (e) {}
    }
  }

  // Call whenever a recording session has finished with the microphone,
  // no matter which path released it (explicit stream, recognizer teardown,
  // failsafe, drag-cancel).
  function markMicReleased() {
    micReleasedAt = Date.now()
    resetAudioContext()
  }

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) {
        audioCtx = new AudioContextClass()
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  }

  function initAudioUnlock() {
    const unlock = () => {
      getAudioContext()
      if (!currentTTSAudio) {
        currentTTSAudio = new Audio()
      }
      currentTTSAudio.play().then(() => {
        currentTTSAudio.pause()
        currentTTSAudio.currentTime = 0
      }).catch(() => {})
    }
    document.addEventListener('click', unlock, { passive: true })
    document.addEventListener('touchstart', unlock, { passive: true })
    document.addEventListener('touchend', unlock, { passive: true })
    document.addEventListener('keydown', unlock, { passive: true })
  }
  initAudioUnlock()

  // iOS doesn't flip the audio session back to playback the instant the mic
  // tracks stop — starting playback inside that window still gets the
  // degraded "call quality" route. A short wait after the last mic release
  // is enough, and in practice the Google TTS request has usually already
  // eaten it.
  function waitForPlaybackRoute() {
    const elapsed = Date.now() - micReleasedAt
    const remaining = 350 - elapsed
    if (!micReleasedAt || remaining <= 0) return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, remaining))
  }

  function stopTTSAudio() {
    // Invalidate anything still waiting on the network, so an answer the user
    // already dismissed (or interrupted by talking again) never starts playing.
    speakToken++
    if (currentSourceNode) {
      try { currentSourceNode.stop() } catch (e) {}
      currentSourceNode = null
    }
    if (currentTTSAudio) {
      currentTTSAudio.pause()
      currentTTSAudio.currentTime = 0
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }

  async function speakText(rawText) {
    if (!rawText) return

    // Two code paths can surface the same message for a single user action
    // (enabling J.U.D.I.S from the wallet card and from the nav pill both
    // greet), which came out as the welcome being spoken twice in a row.
    // Ignore an identical message landing right on top of the previous one —
    // and do it before stopTTSAudio() below, so the duplicate doesn't cut off
    // the copy that's already playing.
    const now = Date.now()
    if (rawText === lastSpokenRaw && now - lastSpokenAt < 3000) {
      console.warn('[TTS] Mensaje duplicado ignorado (ya se está diciendo).')
      return
    }
    lastSpokenRaw = rawText
    lastSpokenAt = now

    stopTTSAudio()
    // Every speakText call invalidates the one before it: the Google request
    // is async, so without this a slow response could start playing on top of
    // a newer message (two voices at once reads as "robot" too).
    const myToken = ++speakToken

    // Clean plain text: remove HTML tags, logs, heard prefixes, emojis
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = rawText
    tempDiv.querySelectorAll('.comp-log, .comp-heard').forEach(el => el.remove())
    let plainText = tempDiv.textContent || tempDiv.innerText || ''
    plainText = plainText.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim()

    // Phonetic replacement: pronounce J.U.D.I.S / judis as "Yudis" seamlessly in audio
    plainText = plainText.replace(/j\.?\s*u\.?\s*d\.?\s*i\.?\s*s\.?/gi, 'Yudis')

    if (!plainText) return

    const apiKey = (typeof __GOOGLE_TTS_KEY__ !== 'undefined' ? __GOOGLE_TTS_KEY__ : '') ||
      (typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_GOOGLE_TTS_API_KEY || import.meta.env.VITE_GOOGLE_TTS || import.meta.env.GOOGLE_TTS || '') : '')

    updateCompanionState('speaking')

    if (!apiKey || apiKey === 'AIzaSy...' || apiKey.trim() === '') {
      console.warn('[Google TTS] No se detectó GOOGLE_TTS en .env. Usando voz sintética del navegador.')
      fallbackWebSpeech(plainText)
      return
    }

    // Try each voice in turn. A single failed request used to leave the
    // answer completely silent (the error path fell through without playing
    // anything), and any transient hiccup — network blip, 429, 5xx, or a key
    // without access to the HD voices — hit only the answers that come after
    // the welcome message.
    let audioContent = null
    let usedVoice = null
    for (const voice of TTS_VOICE_CHAIN) {
      audioContent = await requestGoogleTTS(apiKey.trim(), plainText, voice)
      if (audioContent) {
        usedVoice = voice
        break
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }

    // A newer message started speaking while we were waiting on the network —
    // drop this one instead of talking over it.
    if (myToken !== speakToken) return

    if (audioContent) {
      console.log(`[Google TTS] Reproduciendo voz ${usedVoice.name}:`, plainText)
      await playGoogleAudio(audioContent, myToken)
      return
    }

    console.warn('[Google TTS] Google no devolvió audio con ninguna voz — usando voz del navegador.')
    fallbackWebSpeech(plainText)
  }

  async function requestGoogleTTS(apiKey, plainText, voice) {
    try {
      const audioConfig = {
        audioEncoding: 'MP3',
        speakingRate: voice.rate
      }
      // Chirp3-HD rejects `pitch` outright (400) — it's only accepted by the
      // Standard/WaveNet/Neural2 families.
      if (voice.supportsPitch) audioConfig.pitch = 0.0

      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: { text: plainText },
          voice: {
            languageCode: voice.languageCode,
            name: voice.name,
            ssmlGender: 'FEMALE'
          },
          audioConfig
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.warn(`[Google TTS] Google rechazó la voz ${voice.name}:`, errData)
        return null
      }

      const data = await response.json()
      return data.audioContent || null
    } catch (err) {
      console.warn(`[Google TTS] Error de conexión pidiendo ${voice.name}:`, err)
      return null
    }
  }

  async function playGoogleAudio(audioContent, myToken) {
    // Web Audio API approach (unlocked by touch/click, bypasses mobile asynchronous audio.play() restrictions)
    try {
      await waitForPlaybackRoute()
      if (myToken !== speakToken) return
      const ctx = getAudioContext()
      if (ctx) {
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {})
        }
        const binaryString = atob(audioContent)
        const len = binaryString.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer)
        if (myToken !== speakToken) return
        if (currentSourceNode) {
          try { currentSourceNode.stop() } catch (e) {}
          currentSourceNode = null
        }
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        currentSourceNode = source
        source.onended = () => {
          currentSourceNode = null
          updateCompanionState('idle')
        }
        source.start(0)
        return
      }
    } catch (webAudioErr) {
      console.warn('[Google TTS] Web Audio play failed, falling back to HTMLAudio:', webAudioErr)
    }

    // HTML5 Audio fallback
    await waitForPlaybackRoute()
    if (myToken !== speakToken) return
    if (!currentTTSAudio) {
      currentTTSAudio = new Audio()
    }
    currentTTSAudio.src = `data:audio/mp3;base64,${audioContent}`
    currentTTSAudio.onended = () => {
      updateCompanionState('idle')
    }
    await currentTTSAudio.play().catch(err => {
      console.warn('[Google TTS] HTMLAudio play error:', err)
    })
  }

  // J.U.D.I.S always speaks with a female voice. The Web Speech API doesn't
  // expose a voice's gender, so the only way to keep the fallback consistent
  // with the Google one is by name: the OS default for Spanish is often male
  // (Jorge, Juan, Diego, Pablo…), which is exactly what shows up whenever
  // Google TTS isn't available.
  const FEMALE_ES_VOICES = [
    'paulina', 'mónica', 'monica', 'marisol', 'angelica', 'angélica', 'isabela',
    'sabina', 'dalia', 'helena', 'laura', 'elvira', 'esperanza', 'ximena',
    'lupe', 'penélope', 'penelope', 'conchita', 'lucia', 'lucía', 'mia', 'camila'
  ]
  const MALE_ES_VOICES = [
    'jorge', 'juan', 'diego', 'pablo', 'raul', 'raúl', 'alvaro', 'álvaro',
    'carlos', 'enrique', 'miguel', 'liberto', 'javier', 'andres', 'andrés',
    'gonzalo', 'sergio', 'tomas', 'tomás', 'rocko', 'grandpa', 'eddy', 'reed'
  ]

  function isMaleVoice(voice) {
    const name = (voice.name || '').toLowerCase()
    return MALE_ES_VOICES.some(n => name.includes(n))
  }

  // Picks the least synthetic *female* Spanish voice the browser exposes.
  // getVoices() is empty until the list has loaded (Chrome/Safari populate it
  // asynchronously), and an empty list means the utterance falls back to the
  // OS default — usually an English robot reading Spanish. Wait for
  // 'voiceschanged' once instead of speaking into that gap.
  function getSpanishVoice() {
    const voices = window.speechSynthesis.getVoices() || []
    if (!voices.length) return null
    const es = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'))
    if (!es.length) return null

    const female = es.filter(v => FEMALE_ES_VOICES.some(n => (v.name || '').toLowerCase().includes(n)))
    // Chrome's "Google español" voices are female but carry no personal name,
    // so they only qualify through this second, gender-neutral-name pass.
    const notMale = es.filter(v => !isMaleVoice(v))
    const candidates = female.length ? female : (notMale.length ? notMale : es)

    // Preference order within the candidates, best-sounding first: the
    // neural/cloud voices, then Apple's premium/enhanced ones.
    const preferred = ['Natural', 'Neural', 'Google', 'Premium', 'Enhanced', 'Paulina', 'Mónica', 'Monica', 'Marisol']
    for (const name of preferred) {
      const match = candidates.find(v => (v.name || '').toLowerCase().includes(name.toLowerCase()))
      if (match) return match
    }
    return candidates.find(v => !/compact|eloquence/i.test(v.name || '')) || candidates[0]
  }

  function fallbackWebSpeech(text, isRetry) {
    if (!window.speechSynthesis) {
      setTimeout(() => updateCompanionState('idle'), 2000)
      return
    }

    const voice = getSpanishVoice()
    if (!voice && !isRetry) {
      // Voice list not ready yet — speaking now would use the OS default.
      // Both the event and the timeout race to resume, and exactly one of
      // them may win: whichever fires first must disarm the other, or the
      // message gets spoken twice (the Web Speech API queues utterances
      // rather than replacing them, so it plays start to finish, twice).
      let resumed = false
      let timer = null
      const resume = () => {
        if (resumed) return
        resumed = true
        clearTimeout(timer)
        window.speechSynthesis.removeEventListener('voiceschanged', resume)
        fallbackWebSpeech(text, true)
      }
      window.speechSynthesis.addEventListener('voiceschanged', resume)
      timer = setTimeout(resume, 600)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice && voice.lang ? voice.lang : 'es-US'
    utterance.rate = 0.98
    utterance.pitch = 1.0
    if (voice) {
      utterance.voice = voice
      console.warn('[TTS] Voz del navegador en uso (no es la voz neural):', voice.name)
    }

    utterance.onend = () => updateCompanionState('idle')
    utterance.onerror = () => updateCompanionState('idle')
    // Anything still queued or mid-sentence belongs to a previous message —
    // speak() appends to the queue, so without this the browser reads them
    // one after the other instead of replacing.
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  function hideSpeechBubble() {
    const bubble = companionEl ? companionEl.querySelector('.comp-bubble') : null
    if (bubble) bubble.classList.add('hidden')
    stopTTSAudio()
    updateCompanionState('idle')
  }

  function updateCompanionBubble(text, shouldSpeak = true) {
    if (!companionEl) return
    const bubble = companionEl.querySelector('.comp-bubble')
    const answer = companionEl.querySelector('.comp-answer')
    const hint = companionEl.querySelector('.comp-hint')

    if (text) {
      if (bubble) bubble.classList.remove('hidden')
      if (answer) answer.innerHTML = text
      if (hint) hint.textContent = 'J + U para hablar'
      if (shouldSpeak) {
        speakText(text)
      }
    } else {
      if (bubble) bubble.classList.add('hidden')
      stopTTSAudio()
    }
  }

  /* ─────────────────────────────────────────────────
     ALL TARGETS GUIDANCE (Highlights all 3 simultaneously)
  ───────────────────────────────────────────────── */
  function highlightAllTargets(updateBubble = false) {
    const gridEl = document.getElementById('grid-2')
    if (!gridEl) return

    // Clear previous hotspots
    gridEl.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())

    const cards = gridEl.querySelectorAll('.product-card')
    let firstMatchedCard = null

    TARGETS.forEach(targetProduct => {
      if (found2.has(targetProduct.id)) return

      let matchedCard = null
      cards.forEach(card => {
        const pName = card.querySelector('.p-name')
        if (pName && pName.textContent.trim() === targetProduct.name) {
          matchedCard = card
        }
      })

      if (matchedCard) {
        if (!firstMatchedCard) firstMatchedCard = matchedCard

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
        label.textContent = `✦ ${targetProduct.name}`
        matchedCard.appendChild(label)

        const arrow = document.createElement('div')
        arrow.className = 'hotspot-arrow'
        arrow.textContent = '👇'
        matchedCard.appendChild(arrow)
      }
    })

    // Smoothly scroll grid into view
    if (firstMatchedCard) {
      setTimeout(() => {
        firstMatchedCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }

    // Update J.U.D.I.S text bubble explanation only if requested
    if (updateBubble) {
      const remaining = 3 - found2.size
      if (remaining > 0) {
        const msg = `Señalé los <strong>${remaining === 3 ? '3 productos' : remaining + ' productos restantes'}</strong> en pantalla. ¡Haz clic en ellos para seleccionarlos!`
        updateCompanionBubble(msg)
      }
    }
  }

  function triggerSequentialGuide() {
    highlightAllTargets(false)
  }

  /* ─────────────────────────────────────────────────
     AUDIO RECORDING SIMULATION (J + U Keys)
  ───────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────
     AUDIO RECORDING AND REAL SPEECH RECOGNITION
  ───────────────────────────────────────────────── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // Chrome/Firefox/Edge on iOS still render via WebKit but ship their own
  // SpeechRecognition plumbing rather than Safari's — only Safari itself
  // shows the bug where a continuous-mode session's mic never actually
  // releases on stop()/abort(). Scope the workaround below to Safari only
  // so Chrome iOS keeps behaving exactly as it already does.
  const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(navigator.userAgent)
  let recognition = null
  let receivedSpeechResult = false
  let accumulatedTranscript = ''
  let recordingStartTime = 0
  let micPermissionGranted = false
  let lastRecognitionEndedAt = 0
  let recognitionStartedThisSession = false
  let recognitionRestartCount = 0
  let recognitionFatalError = false
  // Guards against processing the same recording twice — the failsafe
  // below can finalize a session before a late-arriving onend does, and
  // without this both would fire processSpokenCommand/simulateTranscriptionResponse.
  let recordingFinalized = false
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

  function debugFailure(reason) {
    updateCompanionState('speaking')
    const langUsed = recognition && recognition.lang ? recognition.lang : '(sin definir, usa OS)'
    updateCompanionBubble(
      `<div class="comp-heard">🔧 Diagnóstico</div>${reason}` +
      logLine(`mic iniciado: ${recognitionStartedThisSession} · resultado: ${receivedSpeechResult} · intentos: ${recognitionRestartCount}`) +
      logLine(`idioma nav: ${navigator.language} · lang rec: ${langUsed}`) +
      logLine(`browser: ${isIOSSafari ? 'Safari iOS' : isIOS ? 'Chrome/otro iOS' : 'Desktop'} · continuous: ${recognition ? recognition.continuous : '?'}`)
    )
    // The mobile CSS clamps .comp-answer to 6 lines for normal AI answers —
    // this diagnostic block has more lines than that budget and needs to
    // stay fully visible while debugging the iOS Safari SpeechRecognition
    // issue, so lift the clamp just for this bubble.
    const answerEl = companionEl ? companionEl.querySelector('.comp-answer') : null
    if (answerEl) {
      answerEl.style.setProperty('-webkit-line-clamp', 'unset', 'important')
      answerEl.style.setProperty('overflow', 'visible', 'important')
    }
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

  // On iOS Safari we hold our own getUserMedia stream alive alongside
  // SpeechRecognition (see startRecording), since we have no access to the
  // internal MediaStream the recognizer manages itself — and stopping that
  // internal one reliably is exactly what's been failing. Stopping tracks
  // on a stream we hold a direct reference to is a guaranteed way to
  // release the hardware regardless of what the recognizer does.
  function stopExplicitMicStream() {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop())
      micStream = null
    }
    // Even when we never held an explicit stream (desktop, Chrome iOS), the
    // recognizer had the mic open — so the audio session still needs to be
    // handed back to plain playback before J.U.D.I.S answers out loud.
    markMicReleased()
  }

  function beginRecognitionSession() {
    if (!isHotkeyActive) return

    // A previous session can still be lingering here whenever the
    // auto-restart path below replaces `recognition` with a fresh one
    // (common on iOS Safari, where a session's onstart/onend can silently
    // never fire). Left alone, that orphaned instance keeps holding the
    // microphone forever since nothing else references it once
    // `recognition` is reassigned. Detach its handlers (so its own abort
    // doesn't trigger onerror/onend logic meant for the *new* session) and
    // abort it before moving on.
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
      hideSpeechBubble()
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
    // iOS Safari used to be excluded from continuous mode because it never
    // reliably tore down a continuous session's mic on stop()/abort() —
    // but single-utterance mode turned out to end the session on the first
    // in-phrase pause, producing no result at all for anything longer than
    // one short word ("hola" worked, "qué es un oso" didn't). Now that
    // stopExplicitMicStream() guarantees the hardware releases regardless
    // of the recognizer's own teardown, iOS Safari no longer needs this
    // trade-off — use continuous mode everywhere.
    rec.continuous = true
    rec.interimResults = false
    // On any iOS device, leave rec.lang unset so the OS falls back to its
    // own configured dictation language. Setting 'es-419' or 'es-MX'
    // causes silent failures on many iOS devices.
    if (!isIOS) rec.lang = 'es-MX'

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
        simulateTranscriptionResponse('el servicio de voz de este navegador no está disponible')
        return
      }

      // A bare 'no-speech' timeout while the button is still held is exactly
      // the case onend will seamlessly restart from — don't flash an error
      // the user will never actually need to act on.
      if (!isPermissionError && canAutoRestart()) return

      // Stay silent on screen for anything that isn't an actual recognized
      // command — only processSpokenCommand's "ayuda" flow should surface a
      // bubble. Reset back to idle so the button is ready for another try.
      debugFailure(`error nativo: <strong>${event.error}</strong>`)
    }

    rec.onend = () => {
      lastRecognitionEndedAt = Date.now()

      // Session actually captured something — finalize it now that we know
      // no more results are coming, regardless of how long the hold lasted.
      if (receivedSpeechResult && accumulatedTranscript) {
        stopExplicitMicStream()
        if (recordingFinalized) return
        recordingFinalized = true
        processSpokenCommand(accumulatedTranscript)
        return
      }

      if (canAutoRestart()) {
        recognitionRestartCount++
        console.warn(`[J.U.D.I.S Speech] No result yet, auto-restarting (attempt ${recognitionRestartCount})`)
        setTimeout(beginRecognitionSession, 350)
        return
      }

      // Terminal failure (no auto-restart left) — release the backup
      // stream now that no further session will reuse it.
      stopExplicitMicStream()

      // If we stopped but didn't receive any speech transcription, stay
      // silent — only a recognized command should surface anything on
      // screen — and just reset back to idle for the next attempt.
      setTimeout(() => {
        if (companionState === 'listening' || companionState === 'thinking') {
          if (!receivedSpeechResult) {
            debugFailure('la sesión terminó sin error nativo y sin resultado')
          }
        }
      }, 1800)
    }

    return rec
  }

  async function startRecording() {
    if (isHotkeyActive) return
    stopTTSAudio()
    isHotkeyActive = true
    receivedSpeechResult = false
    accumulatedTranscript = ''
    recognitionStartedThisSession = false
    recognitionRestartCount = 0
    recognitionFatalError = false
    recordingFinalized = false
    recordingStartTime = Date.now()
    updateCompanionState('listening')

    // Check if browser context allows microphone/speech access (HTTPS or localhost)
    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (!isSecure) {
      return;
    }

    // Nothing is shown on screen while listening — only a recognized
    // command (see processSpokenCommand) surfaces a bubble. The 'listening'
    // companion state above already gives visual feedback (pulsing mic).
    const canUseRealRecognition = SpeechRecognition && !speechServiceUnavailable

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
          // Set this from the priming grant itself rather than waiting on
          // rec.onstart below — that event can silently never fire on iOS
          // Safari, which otherwise left every single press re-priming
          // (and re-engaging) the microphone instead of just the first one.
          micPermissionGranted = true
          // On iOS Safari, starting SpeechRecognition immediately after the
          // priming stream's tracks are stopped — with no gap at all — can
          // leave the very first real session stuck in limbo (it never
          // truly starts or ends, so the mic never releases). Backdating
          // lastRecognitionEndedAt makes the existing cooldown logic below
          // apply its short gap to this first session too, not just to
          // restarts after a previous one actually ran.
          if (isIOSSafari) lastRecognitionEndedAt = Date.now()
        } catch (err) {
          console.warn('Mic permission priming failed:', err)
          isHotkeyActive = false
          hideSpeechBubble()
          return
        }
      }

      // The permission dialog can interrupt/cancel the in-progress touch on
      // iOS before the user answers it, which already stopped the recording
      // via stopAndProcessRecording. Don't start a session for a button
      // that's no longer held once that await resolves.
      if (!isHotkeyActive) return

      if (isIOSSafari) {
        // SpeechRecognition manages its own internal MediaStream that we
        // have no access to — stopping *that* one reliably is exactly what
        // keeps failing. Requesting and holding our own stream alongside it
        // means we always have real tracks we can stop ourselves on
        // release, regardless of what the recognizer's internal session
        // does under the hood.
        //
        // This used to be awaited here, blocking recognition.start() until
        // it resolved — but that held two concurrent getUserMedia-derived
        // audio sessions open at once during startup (ours + the
        // recognizer's own internal one), which is a likely cause of
        // onstart silently never firing on real devices: the hardware LED
        // turns on from our stream, but the recognizer's internal session
        // never finishes its own handshake. Fire it off in parallel instead
        // of gating recognition.start() on it.
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            if (!isHotkeyActive) {
              stream.getTracks().forEach(t => t.stop())
              return
            }
            micStream = stream
          })
          .catch(err => console.warn('Failed to acquire explicit mic stream for Safari:', err))
      }

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
        isHotkeyActive = false
        hideSpeechBubble()
      }
    }
  }

  let thinkingTimeout = null
  let recordingAbortedByFailsafe = false

  function stopAndProcessRecording() {
    if (!isHotkeyActive) return
    isHotkeyActive = false
    updateCompanionState('thinking')

    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (thinkingTimeout) clearTimeout(thinkingTimeout)

    // Failsafe: onend isn't fully trustworthy on iOS Safari — a session can
    // occasionally hang without firing onend or onerror. Don't wait forever
    // on the recognizer to confirm anything — force a resolution eventually
    // regardless of what it does. This needs to leave enough room after the
    // ~1s release delay above for a normal onresult/onend to land first (see
    // releaseDelay), or it would preempt a real answer that was seconds away
    // from arriving normally. If a transcript already arrived by the time
    // this fires, use it instead of discarding a command the user did
    // successfully say.
    //
    // 2500ms was set back when real recognition never actually worked on
    // iOS Safari, so the exact value didn't matter — now that the speech
    // service is genuinely negotiating over the network (variable
    // latency), that window is too tight for short holds: onstart can
    // still be arriving after release, leaving no time left for
    // onresult/onend before this fires and kills a session that would
    // have succeeded. Give it the same room as desktop.
    const failsafeDelay = isIOSSafari ? 6000 : 4500
    thinkingTimeout = setTimeout(() => {
      if (recordingFinalized) return
      if (companionState === 'thinking') {
        if (recognition) {
          recordingAbortedByFailsafe = true
          try { recognition.abort() } catch (e) {}
        }
        stopExplicitMicStream()
        recordingFinalized = true
        if (receivedSpeechResult && accumulatedTranscript) {
          console.warn('[J.U.D.I.S Speech] Failsafe: recognition hung after producing a result, finalizing anyway.')
          processSpokenCommand(accumulatedTranscript)
        } else {
          console.warn('[J.U.D.I.S Speech] Failsafe triggered: SpeechRecognition hung.')
          simulateTranscriptionResponse('se abortó la grabación, tardó demasiado en responder')
        }
      }
    }, failsafeDelay)

    if (!isSecure) {
      setTimeout(simulateTranscriptionResponse, 1000)
      return;
    }

    if (recognition) {
      const isMobile = window.innerWidth <= 600
      // On iOS Safari, the mic is now released ourselves via
      // stopExplicitMicStream() regardless of what the recognizer does, so
      // there's no longer a reason to special-case a shorter delay here —
      // doing so was cutting recognition off before onresult ever had a
      // chance to fire, so nothing was ever heard/shown. Use the same
      // trailing-word buffer as every other mobile browser.
      const releaseDelay = isMobile ? 1000 : 400
      setTimeout(() => {
        try {
          // abort() discards any result the recognizer hasn't finished
          // finalizing yet — now that onstart/onresult are actually firing
          // on iOS Safari, using abort() here was cutting the session off
          // before it could deliver the transcript, surfacing a bare
          // "aborted" error instead of what was said. stop() asks the
          // recognizer to wrap up gracefully and still fire a final
          // onresult/onend; stopExplicitMicStream() (called from onend
          // below) is what actually guarantees the hardware releases,
          // regardless of how reliably the recognizer's own teardown
          // behaves — so it doesn't need abort() to do that job too.
          recognition.stop()
        } catch (e) {
          console.warn('SpeechRecognition stop failed', e)
          simulateTranscriptionResponse('no se pudo detener la grabación correctamente')
        }
      }, releaseDelay)
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
          stopExplicitMicStream()
          mediaRecorder = null
          simulateTranscriptionResponse()
        }
        mediaRecorder.stop()
      } else {
        setTimeout(simulateTranscriptionResponse, 1000)
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
      stopExplicitMicStream()
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop() } catch (e) {}
      stopExplicitMicStream()
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
      updateCompanionBubble(heard + '¡Perfecto! Te señalo los 3 productos en la pantalla. 🚀')
      setTimeout(() => {
        if (!chrono2.running) {
          startChrono(2)
        }
        highlightAllTargets()
      }, 1500)
    } else {
      const msg = heard + 'Debes decir <strong>"ayuda"</strong> para que te ayude a encontrar los objetos. 😊'
      updateCompanionBubble(msg);
    }
  }

  // Called whenever a recording attempt fails to capture/process real
  // speech. Deliberately stays silent on screen and does NOT advance the
  // guide — only a real transcribed "ayuda" (see processSpokenCommand) is
  // allowed to trigger the guided flow, so this just resets for a retry.
  function simulateTranscriptionResponse(errorReason) {
    if (errorReason) console.warn('[J.U.D.I.S Speech] recording failed:', errorReason)
    debugFailure(errorReason || 'sin resultado')
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
      speakWelcome()
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
      speakWelcome()

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
        getAudioContext()

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
        getAudioContext()
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
        window.open('https://calendly.com/datactar/30min', '_blank')
      })
    })

    // Final card schedule button (redirects to scheduling link)
    const scheduleMeetingBtn = document.getElementById('btn-schedule-meeting')
    if (scheduleMeetingBtn) {
      scheduleMeetingBtn.addEventListener('click', (e) => {
        e.preventDefault()
        window.open('https://calendly.com/datactar/30min', '_blank')
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
