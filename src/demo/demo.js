/* ═══════════════════════════════════════════════════
   J.U.D.I.S DEMO — Interactive Guided Flow v4
   - Single page, companion visible from start
   - 8-step guided sequence with voice + text
   - Timed challenge to find 3 products
   - Voice interaction (J+U / hold rombo)
   - Cheapest product query + visual highlight
   - Final CTA to schedule a meeting
═══════════════════════════════════════════════════ */

;(function () {
  'use strict'

  /* ─────────────────────────────────────────────────
     PRODUCT CATALOGUE
  ───────────────────────────────────────────────── */
  // Prices in US dollars (no thousands).
  const TARGETS = [
    { id: 'hdp', emoji: '🎧', name: 'Audífonos Pro',  price: '$189.99', targetIdx: 0 },
    { id: 'cam', emoji: '📷', name: 'Cámara 4K',      price: '$649.99', targetIdx: 1 },
    { id: 'gpd', emoji: '🎮', name: 'Gamepad Pro',    price: '$89.99',  targetIdx: 2 },
  ]

  const DISTRACTORS = [
    {emoji:'💻',name:'Laptop UltraSlim',price:'$899.99'},
    {emoji:'🖥️',name:'Monitor 4K 27"', price:'$459.99'},
    {emoji:'🖱️',name:'Mouse Ergo',     price:'$49.99'},
    {emoji:'⌨️',name:'Teclado Mec.',   price:'$129.99'},
    {emoji:'📱',name:'Smartphone X12', price:'$799.99'},
    {emoji:'🔌',name:'Hub USB-C 7en1', price:'$39.99'},
    {emoji:'🔋',name:'Powerbank 20k',  price:'$34.99'},
    {emoji:'💿',name:'SSD 1TB NVMe',   price:'$119.99'},
    {emoji:'🖨️',name:'Impresora L.',  price:'$249.99'},
    {emoji:'📡',name:'Router WiFi 6',  price:'$179.99'},
    {emoji:'🎙️',name:'Micrófono USB', price:'$99.99'},
    {emoji:'📹',name:'Webcam HD',      price:'$79.99'},
    {emoji:'💡',name:'Luz LED',        price:'$29.99'},
    {emoji:'🔊',name:'Parlante BT',    price:'$69.99'},
    {emoji:'📺',name:'Smart TV 50"',   price:'$399.99'},
    {emoji:'🕹️',name:'Joystick',      price:'$59.99'},
    {emoji:'📀',name:'Disco Duro 4TB', price:'$89.99'},
    {emoji:'🧲',name:'Soporte Mag.',   price:'$19.99'},
    {emoji:'🔋',name:'Baterías rec.',  price:'$14.99'},
    {emoji:'🔌',name:'Cargador Rápido',price:'$24.99'},
    {emoji:'⌚',name:'Smartwatch S5',  price:'$299.99'},
    {emoji:'🎵',name:'DAC Portátil',   price:'$149.99'},
    {emoji:'🔑',name:'USB 256GB',      price:'$22.99'},
    {emoji:'📷',name:'Trípode Flex.',  price:'$27.99'},
    {emoji:'🌐',name:'Switch 8p',      price:'$69.99'},
    {emoji:'🔐',name:'Llave U2F',      price:'$49.99'},
    {emoji:'🎚️',name:'Mezclador',     price:'$189.99'},
    {emoji:'📲',name:'Soporte Art.',   price:'$34.99'},
    {emoji:'🧤',name:'Guante VR',      price:'$229.99'},
  ]

  /* ─────────────────────────────────────────────────
     STATE VARIABLES
  ───────────────────────────────────────────────── */
  let chrono1 = { interval: null, ms: 0, running: false }
  let chrono2 = { interval: null, ms: 0, running: false }
  let found1 = new Set()
  let found2 = new Set()
  let isJudisEnabled = false
  let companionState = 'idle' // idle, listening, thinking, speaking

  // Guided flow step tracker
  // 0  = nothing yet
  // 1  = the rombo appears
  // 2  = she introduces herself
  // 3  = explains this is your website
  // 4  = invites to play round 1, without her help
  // 5  = round 1 done, time on screen + invitation to enable her
  // 6  = enabled as assistant, explains how to ask for "ayuda"
  // 7  = round 2 running, the 3 products signalled
  // 8  = the 3 products found with her help
  // 9  = invited to ask for the cheapest product
  // 10 = cheapest one pointed out
  // 11 = final metrics + schedule CTA
  let flowStep = 0
  // Set once the user has asked for the cheapest product, so the flow only
  // moves on to the final section after that step actually happened.
  let askedForCheapest = false

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
     GOOGLE TEXT-TO-SPEECH KEY
     ⬇️  PEGA AQUÍ LA KEY (la misma de tu .env) ⬇️

     Se usa solo si el build no trae una key inyectada desde .env o desde
     las variables de entorno de Vercel, así que dejarla aquí hace que la
     voz funcione en producción sin configurar nada en el hosting.

     Está a la vista a propósito: esta demo es un sitio estático, la key
     viaja al navegador de cualquier visitante sin importar dónde la
     guardes. Lo que la protege NO es esconderla, es restringirla en
     Google Cloud Console → Credentials:
       · Application restrictions → HTTP referrers → tu dominio
       · API restrictions → Cloud Text-to-Speech API
  ───────────────────────────────────────────────── */
  const GOOGLE_TTS_KEY = 'AIzaSyB87YaivaFHPQ8o_QfORo7tIVWO2-p5rF4'

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
      card.dataset.name = product.name
      card.dataset.price = product.price
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
     ROUND 1 CLICKS — without J.U.D.I.S
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
      advanceFlow(5)
    }
  }

  /* ─────────────────────────────────────────────────
     ROUND 2 CLICKS — with J.U.D.I.S
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
    // Remove the hotspot overlays from the card just clicked
    card.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())
    card.style.zIndex = ''
    found2.add(product.id)

    const targetDetails = TARGETS.find(t => t.id === product.id)
    const badge = document.getElementById(`tb2-${targetDetails.targetIdx}`)
    if (badge) badge.classList.add('found')

    document.getElementById('found-2').textContent = found2.size

    if (found2.size < 3) {
      const remaining = 3 - found2.size
      updateCompanionState('speaking')
      updateCompanionBubble(`¡Excelente! Encontraste <strong>${targetDetails.name}</strong>. Te ${remaining === 1 ? 'queda 1 producto señalado' : 'quedan ' + remaining + ' productos señalados'}.`)
      return
    }

    stopChrono(2)
    saveAnalytics({
      max_section: 4,
      ronda2_time: Math.round(chrono2.ms / 1000)
    })
    advanceFlow(8)
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
      companionEl.classList.add('following', 'entrance-anim')
      updateCompanionState('idle')
      updateCompanionPosition(mouseX, mouseY)
      // Remove animation class after it completes so it doesn't interfere
      setTimeout(() => companionEl.classList.remove('entrance-anim'), 700)
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

    const btnMobile = document.getElementById('btn-close-bubble-mobile')
    if (state === 'speaking') {
      if (btnMobile) btnMobile.classList.add('visible')
    } else {
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

  // Voices J.U.D.I.S speaks with, best-sounding first — every one of them female.
  // We prioritize Neural2-A and Wavenet-A which are supported on standard Google Cloud TTS keys.
  const TTS_VOICE_CHAIN = [
    { name: 'es-US-Neural2-A',          languageCode: 'es-US', rate: 1.0, supportsPitch: true },
    { name: 'es-US-Wavenet-A',          languageCode: 'es-US', rate: 1.0, supportsPitch: true },
    { name: 'es-ES-Neural2-A',          languageCode: 'es-ES', rate: 1.0, supportsPitch: true },
    { name: 'es-ES-Wavenet-C',          languageCode: 'es-ES', rate: 1.0, supportsPitch: true },
    { name: 'es-US-Studio-A',           languageCode: 'es-US', rate: 1.0, supportsPitch: true }
  ]

  let micReleasedAt = 0

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

  function waitForPlaybackRoute() {
    const elapsed = Date.now() - micReleasedAt
    const remaining = 350 - elapsed
    if (!micReleasedAt || remaining <= 0) return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, remaining))
  }

  function stopTTSAudio() {
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

  // Returns a promise that resolves when TTS finishes playing (or immediately
  // if nothing was produced). This lets the guided-flow steps chain one
  // message after the other without overlapping.
  // `onStart(durationMs)` fires the moment the voice actually starts sounding,
  // so the bubble can reveal its text in sync with what is being heard.
  async function speakText(rawText, onStart) {
    if (!rawText) return

    const now = Date.now()
    if (rawText === lastSpokenRaw && now - lastSpokenAt < 3000) {
      console.warn('[TTS] Mensaje duplicado ignorado (ya se está diciendo).')
      return
    }
    lastSpokenRaw = rawText
    lastSpokenAt = now

    stopTTSAudio()
    const myToken = ++speakToken

    // Clean plain text
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = rawText
    tempDiv.querySelectorAll('.comp-log, .comp-heard').forEach(el => el.remove())
    let plainText = tempDiv.textContent || tempDiv.innerText || ''
    plainText = plainText.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim()
    plainText = plainText.replace(/j\.?\s*u\.?\s*d\.?\s*i\.?\s*s\.?/gi, 'Yudis')
    // En pantalla el tiempo se muestra como "12.4s", pero leído en voz alta
    // eso suena como la letra ese: para hablar tiene que decir "segundos".
    plainText = plainText.replace(/(\d+(?:[.,]\d+)?)\s*s\b/gi, '$1 segundos')

    if (!plainText) return

    // Build-time key first (.env local o variable de entorno del hosting);
    // si el build no trae ninguna, la key escrita arriba es el respaldo.
    const apiKey = (typeof __GOOGLE_TTS_KEY__ !== 'undefined' ? __GOOGLE_TTS_KEY__ : '') ||
      (typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_GOOGLE_TTS_API_KEY || import.meta.env.VITE_GOOGLE_TTS || import.meta.env.GOOGLE_TTS || '') : '') ||
      GOOGLE_TTS_KEY

    console.log('[TTS] API key detectada:', apiKey ? `${apiKey.slice(0, 10)}...` : '❌ NO HAY KEY — usará voz de robot del navegador')

    updateCompanionState('speaking')

    if (!apiKey || apiKey === 'AIzaSy...' || apiKey.trim() === '') {
      console.warn('[Google TTS] ⚠️ No se detectó GOOGLE_TTS en .env. Usando voz sintética del navegador (sonará robótica).')
      return fallbackWebSpeech(plainText, false, onStart)
    }

    let audioContent = null
    let usedVoice = null
    for (const voice of TTS_VOICE_CHAIN) {
      audioContent = await requestGoogleTTS(apiKey.trim(), plainText, voice)
      if (audioContent) {
        usedVoice = voice
        break
      }
      await new Promise(resolve => setTimeout(resolve, 150))
    }

    if (myToken !== speakToken) return

    if (audioContent) {
      console.log(`[Google TTS] Reproduciendo voz ${usedVoice.name}:`, plainText)
      return playGoogleAudio(audioContent, myToken, onStart)
    }

    console.warn('[Google TTS] Google no devolvió audio con ninguna voz — usando voz del navegador.')
    return fallbackWebSpeech(plainText, false, onStart)
  }

  async function requestGoogleTTS(apiKey, plainText, voice) {
    try {
      const audioConfig = {
        audioEncoding: 'MP3',
        speakingRate: voice.rate
      }
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

  async function playGoogleAudio(audioContent, myToken, onStart) {
    // Only ever announce the start once per playback.
    let announced = false
    const announce = (durationMs) => {
      if (announced) return
      announced = true
      if (typeof onStart === 'function') onStart(durationMs)
    }

    try {
      await waitForPlaybackRoute()
      if (myToken !== speakToken) return
      const ctx = getAudioContext()

      // If AudioContext is active and running, use Web Audio API
      if (ctx && ctx.state === 'running') {
        const raw = atob(audioContent)
        const buf = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)

        const audioBuffer = await ctx.decodeAudioData(buf.buffer)
        if (myToken !== speakToken) return

        return new Promise((resolve) => {
          let resolved = false
          const done = () => {
            if (resolved) return
            resolved = true
            currentSourceNode = null
            updateCompanionState('idle')
            resolve()
          }

          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)
          currentSourceNode = source

          source.onended = done

          const durationMs = (audioBuffer.duration || 3) * 1000 + 300
          setTimeout(done, durationMs)

          source.start(0)
          // The text follows the real length of the audio buffer.
          announce((audioBuffer.duration || 3) * 1000)
        })
      }

      // If AudioContext is suspended (e.g. initial load before user interaction), use HTML5 Audio
      return new Promise((resolve) => {
        let resolved = false
        const done = () => {
          if (resolved) return
          resolved = true
          currentTTSAudio = null
          updateCompanionState('idle')
          resolve()
        }

        const audio = new Audio('data:audio/mp3;base64,' + audioContent)
        currentTTSAudio = audio
        audio.onended = done
        audio.onerror = () => {
          fallbackWebSpeech(lastSpokenRaw, false, announced ? null : onStart).then(done)
        }

        audio.play().then(() => {
          const durationMs = (audio.duration || 4) * 1000 + 300
          announce((audio.duration || 4) * 1000)
          setTimeout(done, durationMs)
        }).catch((err) => {
          console.warn('[Google TTS] HTML5 Audio autoplay blocked, using Web Speech fallback:', err)
          fallbackWebSpeech(lastSpokenRaw, false, announced ? null : onStart).then(done)
        })

        // Safety fallback timeout
        setTimeout(done, 5000)
      })
    } catch (err) {
      console.warn('[Google TTS] Error playing audio, falling back to browser voice:', err)
      if (myToken === speakToken) {
        return fallbackWebSpeech(lastSpokenRaw, false, announced ? null : onStart)
      }
    }
  }

  // J.U.D.I.S always speaks with a female voice. The Web Speech API doesn't
  // expose a voice's gender, so the only way to keep the fallback consistent
  // is to filter by known voice names.
  const FEMALE_ES_VOICES = [
    'paulina', 'mónica', 'monica', 'jimena', 'angelica', 'angélica',
  ]

  const MALE_ES_VOICES = [
    'jorge', 'carlos', 'diego', 'juan', 'andrés', 'andres',
  ]

  function isMaleVoice(voice) {
    const name = (voice.name || '').toLowerCase()
    return MALE_ES_VOICES.some(n => name.includes(n))
  }

  function getSpanishVoice() {
    const voices = window.speechSynthesis.getVoices() || []
    if (!voices.length) return null
    const es = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'))
    if (!es.length) return null

    const female = es.filter(v => FEMALE_ES_VOICES.some(n => (v.name || '').toLowerCase().includes(n)))
    const notMale = es.filter(v => !isMaleVoice(v))

    const best = female.length ? female : notMale.length ? notMale : es

    const ranked = [...best].sort((a, b) => {
      const score = v => {
        const n = (v.name || '').toLowerCase()
        if (n.includes('neural') || n.includes('cloud')) return 4
        if (n.includes('premium') || n.includes('enhanced')) return 3
        if (n.includes('google')) return 2
        return 1
      }
      return score(b) - score(a)
    })

    return ranked[0] || null
  }

  function fallbackWebSpeech(text, isRetry, onStart) {
    if (!window.speechSynthesis) {
      console.warn('[TTS] speechSynthesis no disponible.')
      return Promise.resolve()
    }
    const voice = getSpanishVoice()
    if (!voice && !isRetry) {
      return new Promise((resolve) => {
        const resume = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', resume)
          fallbackWebSpeech(text, true, onStart).then(resolve)
        }
        window.speechSynthesis.addEventListener('voiceschanged', resume)
        setTimeout(resolve, 3000)
      })
    }

    return new Promise((resolve) => {
      let resolved = false
      const done = () => {
        if (resolved) return
        resolved = true
        updateCompanionState('idle')
        resolve()
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voice && voice.lang ? voice.lang : 'es-US'
      utterance.rate = 1.0
      utterance.pitch = 1.0
      if (voice) {
        utterance.voice = voice
        console.warn('[TTS] Voz del navegador en uso (no es la voz neural):', voice.name)
      }

      utterance.onend = done
      utterance.onerror = done

      // Safety timeout in case browser SpeechSynthesis utterance hangs
      const durationEstimate = Math.max(2500, text.length * 90)
      setTimeout(done, durationEstimate)

      // The browser voice gives no duration up front, so the text follows an
      // estimate based on how much there is to read.
      if (typeof onStart === 'function') {
        let announced = false
        const announce = () => {
          if (announced) return
          announced = true
          onStart(Math.max(1500, text.length * 68))
        }
        utterance.onstart = announce
        // Some browsers never fire onstart — don't leave the text waiting.
        setTimeout(announce, 700)
      }

      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }

  /* ─────────────────────────────────────────────────
     TEXT THAT FOLLOWS THE VOICE
     The bubble words light up one by one, at the pace of the audio
     J.U.D.I.S is actually playing, so you read exactly what you hear.
  ───────────────────────────────────────────────── */
  let karaokeRaf = null
  let karaokeSafetyTimer = null
  // Identifies the message currently in the bubble, so a previous message
  // finishing late can never wipe the one that replaced it.
  let bubbleGen = 0

  function clearKaraoke() {
    if (karaokeRaf) { cancelAnimationFrame(karaokeRaf); karaokeRaf = null }
    if (karaokeSafetyTimer) { clearTimeout(karaokeSafetyTimer); karaokeSafetyTimer = null }
  }

  // Wraps every readable word in its own span so it can be lit up
  // individually, keeping the original markup (<strong>, <em>…) intact.
  // The meta lines ("Te escuché decir…", debug logs) are not spoken, so they
  // are left fully visible from the start.
  function wrapWordsForSpeech(rootEl) {
    const words = []
    const textNodes = []
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null)
    while (walker.nextNode()) textNodes.push(walker.currentNode)

    textNodes.forEach(node => {
      const parent = node.parentElement
      if (!parent || parent.closest('.comp-heard, .comp-log')) return
      if (!node.nodeValue.trim()) return

      const frag = document.createDocumentFragment()
      node.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return
        if (!part.trim()) {
          frag.appendChild(document.createTextNode(part))
          return
        }
        const span = document.createElement('span')
        span.className = 'comp-word'
        span.textContent = part
        frag.appendChild(span)
        words.push(span)
      })
      node.parentNode.replaceChild(frag, node)
    })

    return words
  }

  function revealAllWords(words) {
    words.forEach(w => w.classList.add('spoken'))
  }

  function startKaraoke(words, durationMs) {
    clearKaraoke()
    if (!words.length) return

    const total = Math.max(600, durationMs || 0)
    // Longer words take proportionally longer to say than short ones.
    const weights = words.map(w => Math.max(1, w.textContent.length))
    const totalWeight = weights.reduce((a, b) => a + b, 0)

    const startsAt = []
    let acc = 0
    weights.forEach(weight => {
      startsAt.push((acc / totalWeight) * total)
      acc += weight
    })

    const t0 = performance.now()
    const LEAD_MS = 120 // light the word a hair before it's heard
    let next = 0

    const tick = (now) => {
      const elapsed = now - t0 + LEAD_MS
      while (next < startsAt.length && startsAt[next] <= elapsed) {
        words[next].classList.add('spoken')
        next++
      }
      karaokeRaf = next < words.length ? requestAnimationFrame(tick) : null
    }
    karaokeRaf = requestAnimationFrame(tick)
  }

  // How long a message needs to stay on screen to be read comfortably,
  // roughly the pace of someone reading Spanish out loud.
  function readingTimeFor(plainText) {
    const chars = (plainText || '').trim().length
    return Math.min(11000, Math.max(2400, 900 + chars * 62))
  }

  function hideSpeechBubble() {
    const bubble = companionEl ? companionEl.querySelector('.comp-bubble') : null
    if (bubble) bubble.classList.add('hidden')
    clearKaraoke()
    stopTTSAudio()
    updateCompanionState('idle')
  }

  function updateCompanionBubble(text, shouldSpeak = true) {
    if (!companionEl) return Promise.resolve()
    const bubble = companionEl.querySelector('.comp-bubble')
    const answer = companionEl.querySelector('.comp-answer')
    const hint = companionEl.querySelector('.comp-hint')

    if (text) {
      if (bubble) bubble.classList.remove('hidden')
      if (hint) {
        hint.textContent = window.innerWidth <= 600
          ? 'Mantén presionado para hablar'
          : 'J + U para hablar'
      }

      clearKaraoke()
      const myGen = ++bubbleGen
      let words = []
      if (answer) {
        answer.innerHTML = text
        words = wrapWordsForSpeech(answer)
      }

      if (!shouldSpeak) {
        revealAllWords(words)
        return Promise.resolve()
      }

      // If the voice never starts (no API key, autoplay blocked, muted tab…)
      // the message must still be readable.
      karaokeSafetyTimer = setTimeout(() => revealAllWords(words), 2800)

      // Whoever awaits this message also waits at least as long as it takes
      // to read it. Without this, a silent environment resolves the promise
      // almost instantly and the guided steps flash by unreadably.
      const readMs = readingTimeFor(answer ? answer.textContent : '')
      const readable = new Promise(resolve => setTimeout(resolve, readMs))

      const spoken = speakText(text, (durationMs) => {
        if (myGen !== bubbleGen) return
        startKaraoke(words, durationMs)
      }).then(() => {
        revealAllWords(words)
        if (myGen === bubbleGen) clearKaraoke()
      })

      return Promise.all([spoken, readable]).then(() => {})
    }

    if (bubble) bubble.classList.add('hidden')
    clearKaraoke()
    stopTTSAudio()
    return Promise.resolve()
  }

  /* ─────────────────────────────────────────────────
     GUIDED FLOW
     Intro → round 1 alone → time on screen → enable J.U.D.I.S →
     round 2 asking her for help → cheapest product → schedule.
  ───────────────────────────────────────────────── */
  function isMobileViewport() {
    return window.innerWidth <= 600
  }

  // Browsers refuse to play any sound until the visitor has interacted with
  // the page. On localhost that permission is usually already granted from
  // previous visits, which is why the intro speaks right away there and stays
  // mute on a freshly deployed domain. So instead of narrating to an empty
  // room, ask for a click first and only then start talking.
  function waitForAudioPermission() {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'running') return Promise.resolve()

    updateCompanionBubble(
      isMobileViewport()
        ? '👋 Toca la pantalla para escucharme.'
        : '👋 Haz clic en cualquier parte para escucharme.',
      false
    )

    return new Promise(resolve => {
      const events = ['click', 'touchend', 'keydown']
      const go = () => {
        events.forEach(ev => document.removeEventListener(ev, go))
        const ac = getAudioContext()
        if (ac && ac.state === 'suspended') {
          ac.resume().then(resolve).catch(() => resolve())
          return
        }
        resolve()
      }
      events.forEach(ev => document.addEventListener(ev, go, { passive: true }))
    })
  }

  // Each step awaits the TTS to finish playing before advancing, so the
  // voice never gets cut off mid-sentence by the next message.
  async function advanceFlow(toStep) {
    if (toStep <= flowStep) return
    flowStep = toStep

    switch (toStep) {
      case 1: // The rombo shows up and waits until it can actually be heard
        enableJudisCompanion()
        waitForAudioPermission().then(() => {
          setTimeout(() => advanceFlow(2), 600)
        })
        break

      case 2: // She introduces herself
        await updateCompanionBubble('¡Hola! Soy J.U.D.I.S., tu asistente de compras inteligente.')
        setTimeout(() => advanceFlow(3), 700)
        break

      case 3: // Sets the scene: this is your website
        await updateCompanionBubble('Imagina que este es tu sitio web, un ecommerce donde tus clientes buscan productos. ¡Juguemos un juego!')
        setTimeout(() => advanceFlow(4), 700)
        break

      case 4: // Invites to play round 1, still without her help
        await updateCompanionBubble('Primero hazlo <strong>sin mi ayuda</strong>: pulsa <strong>Iniciar cronómetro</strong> y encuentra los 3 productos lo más rápido que puedas. ¡Vamos!')
        // Step 5 is triggered by handleCardClick1 when the 3 are found
        break

      case 5: // Round 1 done: show the time and invite to enable her
        await updateCompanionBubble(`¡Lo lograste en <strong>${fmtSecs(chrono1.ms)}</strong>! Así compran hoy tus clientes: solos. Ahora <strong>habilítame</strong> y hagámoslo juntos. 👇`)
        setTimeout(() => {
          const timeEl = document.getElementById('time-1')
          if (timeEl) timeEl.textContent = fmtSecs(chrono1.ms)
          const secResult1 = document.getElementById('sec-result1')
          const secActivate = document.getElementById('sec-activate')
          if (secResult1) secResult1.classList.remove('hidden-sec')
          if (secActivate) secActivate.classList.remove('hidden-sec')
          if (secResult1) secResult1.scrollIntoView({ behavior: 'smooth' })
        }, 300)
        break

      case 6: { // Enabled as a shopping assistant: explains how to ask for help
        const msg = isMobileViewport()
          ? '¡Listo, ya estoy activa! Hagamos la misma búsqueda juntos: pulsa <strong>Iniciar con J.U.D.I.S</strong>, mantén presionado el rombo y pídeme <strong>ayuda</strong>.'
          : '¡Listo, ya estoy activa! Hagamos la misma búsqueda juntos: pulsa <strong>Iniciar con J.U.D.I.S</strong>, mantén presionadas las teclas <strong>J + U</strong> y pídeme <strong>ayuda</strong>.'
        await updateCompanionBubble(msg)
        break
      }

      case 7: // Round 2 running, the 3 products are signalled on screen
        break

      case 8: // The 3 products found with her help
        await updateCompanionBubble(`¡Increíble! Con mi ayuda los encontraste en <strong>${fmtSecs(chrono2.ms)}</strong>. 🎉`)
        setTimeout(() => advanceFlow(9), 700)
        break

      case 9: { // Invites the user to ask for the cheapest product
        const msg = isMobileViewport()
          ? 'Ahora imagina que quieres comprar el producto más barato. Mantén presionado el rombo y pregúntame: <strong>¿cuál es el más barato?</strong>'
          : 'Ahora imagina que quieres comprar el producto más barato. Presiona <strong>J + U</strong> y pregúntame: <strong>¿cuál es el más barato?</strong>'
        updateCompanionBubble(msg)
        // Step 10 is triggered from processSpokenCommand
        break
      }

      case 10: // Cheapest product pointed out (handled in processSpokenCommand)
        break

      case 11: { // Time comparison + schedule CTA
        const secFinal = document.getElementById('sec-final')
        if (secFinal) {
          secFinal.classList.remove('hidden-sec')
          showFinalMetrics()
          secFinal.scrollIntoView({ behavior: 'smooth' })
        }
        await updateCompanionBubble('Esto es <strong>J.U.D.I.S.</strong> — quiero aplicarlo en tu web. ¡Agendemos una cita! 📅')
        setTimeout(() => highlightScheduleButton(), 400)
        break
      }
    }
  }

  /* ─────────────────────────────────────────────────
     FINAL RESULTS — round 1 vs round 2
  ───────────────────────────────────────────────── */
  function showFinalMetrics() {
    const t1 = chrono1.ms
    const t2 = chrono2.ms
    const ratio = t1 > 0 ? Math.round(((t1 - t2) / t1) * 100) : 0
    const pctImprovement = Math.max(0, ratio)

    const c1 = document.getElementById('cmp-t1')
    const c2 = document.getElementById('cmp-t2')
    const pct = document.getElementById('impact-pct')
    const msg = document.getElementById('impact-msg')
    if (c1) c1.textContent = fmtSecs(t1)
    if (c2) c2.textContent = fmtSecs(t2)
    if (pct) pct.textContent = `${pctImprovement}%`

    const verb = pctImprovement >= 60 ? 'enormemente más rápido' : pctImprovement >= 30 ? 'notablemente más rápido' : 'más rápido'
    if (msg) {
      msg.innerHTML = `Con J.U.D.I.S tus clientes compran un <strong>${pctImprovement}%</strong> ${verb}. Menos fricción significa más conversiones.`
    }
  }

  /* ─────────────────────────────────────────────────
     POINT OUT THE 3 TARGETS (round 2)
  ───────────────────────────────────────────────── */
  function highlightAllTargets() {
    const gridEl = document.getElementById('grid-2')
    if (!gridEl) return

    gridEl.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())

    const cards = gridEl.querySelectorAll('.product-card')
    let firstMatchedCard = null

    TARGETS.forEach(targetProduct => {
      if (found2.has(targetProduct.id)) return

      let matchedCard = null
      cards.forEach(card => {
        if (card.dataset.id === targetProduct.id) matchedCard = card
      })
      if (!matchedCard) return

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
    })

    if (firstMatchedCard) {
      setTimeout(() => {
        firstMatchedCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }

  /* ─────────────────────────────────────────────────
     HIGHLIGHT CHEAPEST PRODUCT
  ───────────────────────────────────────────────── */
  function parsePrice(priceStr) {
    return parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0
  }

  // The cheapest product is asked about during round 2, so point at the grid
  // that is actually on screen at that moment.
  function getActiveGrid() {
    const secLuzia = document.getElementById('sec-luzia')
    const round2Visible = secLuzia && !secLuzia.classList.contains('hidden-sec')
    return document.getElementById(round2Visible ? 'grid-2' : 'grid-1')
  }

  function highlightCheapestProduct() {
    const gridEl = getActiveGrid()
    if (!gridEl) return

    // Clear previous hotspots
    gridEl.querySelectorAll('.hotspot-ring, .hotspot-ring-2, .hotspot-label, .hotspot-arrow').forEach(el => el.remove())

    const cards = gridEl.querySelectorAll('.product-card')
    let cheapestCard = null
    let cheapestPrice = Infinity
    let cheapestName = ''
    let cheapestPriceStr = ''

    cards.forEach(card => {
      const priceEl = card.querySelector('.p-price')
      const nameEl = card.querySelector('.p-name')
      if (!priceEl || !nameEl) return
      const price = parsePrice(priceEl.textContent)
      if (price > 0 && price < cheapestPrice) {
        cheapestPrice = price
        cheapestCard = card
        cheapestName = nameEl.textContent
        cheapestPriceStr = priceEl.textContent
      }
    })

    if (!cheapestCard) return { name: 'desconocido', price: '$0' }

    cheapestCard.style.position = 'relative'
    cheapestCard.style.zIndex = '10'

    const ring = document.createElement('div')
    ring.className = 'hotspot-ring'
    cheapestCard.appendChild(ring)

    const ring2 = document.createElement('div')
    ring2.className = 'hotspot-ring-2'
    cheapestCard.appendChild(ring2)

    const label = document.createElement('div')
    label.className = 'hotspot-label'
    label.textContent = `✦ ¡El más barato!`
    cheapestCard.appendChild(label)

    const arrow = document.createElement('div')
    arrow.className = 'hotspot-arrow'
    arrow.textContent = '👇'
    cheapestCard.appendChild(arrow)

    // Scroll into view
    setTimeout(() => {
      cheapestCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)

    return { name: cheapestName, price: cheapestPriceStr }
  }

  /* ─────────────────────────────────────────────────
     HIGHLIGHT SCHEDULE BUTTON
  ───────────────────────────────────────────────── */
  function highlightScheduleButton() {
    const secFinal = document.getElementById('sec-final')
    const isFinalVisible = secFinal && !secFinal.classList.contains('hidden-sec')

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

    targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' })

    setTimeout(() => {
      ring.remove()
      label.remove()
      arrow.remove()
    }, 8000)
  }

  /* ─────────────────────────────────────────────────
     AUDIO RECORDING AND REAL SPEECH RECOGNITION
  ───────────────────────────────────────────────── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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
  let recordingFinalized = false
  let speechServiceUnavailable = false
  const MAX_RECOGNITION_RESTARTS = 4

  function logLine(text) {
    return `<div class="comp-log">🪵 ${text}</div>`
  }

  function debugFailure(reason) {
    updateCompanionState('speaking')
    const isMobile = window.innerWidth <= 600
    const howTo = isMobile
      ? 'Mantén presionado el rombo y habla.'
      : 'Mantén presionadas <strong>J + U</strong> y habla.'
    updateCompanionBubble(
      logLine(`mic iniciado: ${recognitionStartedThisSession} · resultado: ${receivedSpeechResult} · intentos: ${recognitionRestartCount}`) +
      `No escuché nada. ${howTo}`
    )

    // On mobile keep the bubble long enough to read; on desktop it can fade
    // stay fully visible while debugging the iOS Safari SpeechRecognition
    // behaviour so the user sees the log line.
  }

  function stopExplicitMicStream() {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop())
      micStream = null
    }
    markMicReleased()
  }

  function canRealRecognitionRestart() {
    return (
      isHotkeyActive &&
      !receivedSpeechResult &&
      recognitionRestartCount < MAX_RECOGNITION_RESTARTS &&
      !recognitionFatalError
    )
  }

  // SpeechRecognition (see startRecording), since we have no access to the
  // native mic session it uses — without this, iOS routes audio through the
  // earpiece for the rest of the page's lifetime once recognition starts,
  // making every subsequent TTS playback sound thin and tinny. Requesting
  // our own parallel stream and stopping it on release flips the audio
  // session back to playback mode properly.
  async function requestExplicitMicAccess() {
    if (micPermissionGranted && !isIOSSafari) return
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micPermissionGranted = true
    } catch (e) {
      console.warn('[J.U.D.I.S Speech] Explicit mic access denied or unavailable:', e)
    }
  }

  function beginRecognitionSession() {
    try {
      if (recognition) {
        try { recognition.abort() } catch (e) {}
      }
      recognition = null
    } catch (e) {
      console.warn('SpeechRecognition failed to start:', e)
      if (thinkingTimeout) clearTimeout(thinkingTimeout)
      hideSpeechBubble()
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = 'es-MX'
    rec.interimResults = false
    rec.continuous = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      recognitionStartedThisSession = true
    }

    rec.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' '
        }
      }
      if (transcript.trim()) {
        receivedSpeechResult = true
        accumulatedTranscript = (accumulatedTranscript + ' ' + transcript).trim()
      }
      console.log('[J.U.D.I.S Speech] Transcript so far:', accumulatedTranscript)
    }

    rec.onerror = (event) => {
      console.warn('[J.U.D.I.S Speech] Error:', event.error)

      if (event.error === 'aborted') return

      if (event.error === 'no-speech') {
        if (canRealRecognitionRestart()) {
          recognitionRestartCount++
          try { rec.start() } catch (e) {}
          return
        }
      }

      // The speech *service* itself refusing
      if (event.error === 'service-not-allowed' || event.error === 'not-allowed') {
        if (!micPermissionGranted) {
          speechServiceUnavailable = true
          console.warn('[J.U.D.I.S Speech] service-not-allowed — disabling real recognition for this session.')
        }
      }

      if (event.error === 'network') {
        recognitionFatalError = true
      }

      // A bare 'no-speech' timeout while the button is still held is exactly
      // what happens with a slow start: just restart silently.
      if (event.error === 'no-speech' && isHotkeyActive) {
        return
      }
    }

    rec.onend = () => {
      lastRecognitionEndedAt = Date.now()
      stopExplicitMicStream()

      if (recordingFinalized) return
      recordingFinalized = true
      if (thinkingTimeout) { clearTimeout(thinkingTimeout); thinkingTimeout = null }

      if (receivedSpeechResult && accumulatedTranscript) {
        processSpokenCommand(accumulatedTranscript)
      } else if (isHotkeyActive && canRealRecognitionRestart()) {
        recognitionRestartCount++
        recordingFinalized = false
        console.warn(`[J.U.D.I.S Speech] No result yet, auto-restarting (attempt ${recognitionRestartCount})`)
        try { rec.start() } catch (e) {}
      } else {
        // If we stopped but didn't receive any speech transcription, stay
        // on the current flow step without advancing
        setTimeout(() => {
          if (companionState === 'thinking') {
            if (!receivedSpeechResult) {
              simulateTranscriptionResponse('sin resultado al terminar')
            }
          }
        }, 300)
      }
    }

    recognition = rec
    receivedSpeechResult = false
    accumulatedTranscript = ''
    recognitionStartedThisSession = false
    recognitionRestartCount = 0
    recognitionFatalError = false
    recordingFinalized = false

    try {
      rec.start()
    } catch (e) {
      console.warn('[J.U.D.I.S Speech] Could not start recognition:', e)
    }
  }

  async function startRecording() {
    if (isHotkeyActive) return
    isHotkeyActive = true
    recordingCancelledByDrag = false
    recordingStartTime = Date.now()
    updateCompanionState('listening')
    updateCompanionBubble('🎙️ Te escucho...', false)

    const isSecure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1'

    if (!isSecure) {
      console.warn('[J.U.D.I.S Speech] Not in a secure context, cannot use microphone')
      updateCompanionBubble('⚠️ Para usar el micrófono, abre esta página con HTTPS o localhost.')
      isHotkeyActive = false
      return
    }

    const canUseRealRecognition = SpeechRecognition && !speechServiceUnavailable

    if (canUseRealRecognition) {
      await requestExplicitMicAccess()
      if (!isHotkeyActive) { stopExplicitMicStream(); return }

      const cooldownRemaining = isIOSSafari
        ? Math.max(0, 800 - (Date.now() - lastRecognitionEndedAt))
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
      const releaseDelay = isMobile ? 1000 : 400
      setTimeout(() => {
        try {
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

  /* ─────────────────────────────────────────────────
     PROCESS SPOKEN COMMANDS
  ───────────────────────────────────────────────── */
  async function processSpokenCommand(transcript) {
    sessionQuestions.push(transcript)
    saveAnalytics({
      questions: sessionQuestions
    })
    updateCompanionState('speaking')
    const text = normalizeText(transcript)
    const heard = `<div class="comp-heard">🎧 Te escuché decir: "<em>${transcript}</em>"</div>`

    // "¿Cuál es el más barato?" — point at it, then move on to the CTA
    if (text.includes('barato') || text.includes('barata') || text.includes('economico') || text.includes('menor precio') || text.includes('menos caro') || text.includes('cheapest')) {
      // Asking this before round 2 is over would jump to the final comparison
      // with the second chronometer still at zero.
      if (found2.size < 3) {
        const pendiente = flowStep < 6
          ? 'Primero encuentra los 3 productos por tu cuenta y actívame. 😊'
          : 'Primero terminemos la búsqueda: di <strong>"ayuda"</strong> y te señalo los 3 productos. 😊'
        updateCompanionBubble(heard + pendiente)
        return
      }

      const result = highlightCheapestProduct()
      askedForCheapest = true
      advanceFlow(10)
      await updateCompanionBubble(
        heard +
        (result
          ? `El producto más barato es <strong>${result.name}</strong> a <strong>${result.price}</strong>. ¡Te lo señalé en pantalla!`
          : 'No encontré productos en pantalla para comparar.')
      )
      if (result) setTimeout(() => advanceFlow(11), 900)
      return
    }

    // "Ayuda" — she points out the 3 products of round 2. During round 1 she
    // is only the narrator: the whole point is that you search on your own.
    if (text.includes('ayud') || text.includes('objeto') || text.includes('producto') || text.includes('mostrar') || text.includes('buscar') || text.includes('guiar') || text.includes('encontrar') || text.includes('donde')) {
      if (flowStep < 6) {
        updateCompanionBubble(heard + 'Todavía no estoy habilitada para buscar por ti. Termina esta ronda tú solo y después actívame. 😉')
        return
      }
      if (found2.size < 3) {
        await updateCompanionBubble(heard + '¡Perfecto! Te señalo los 3 productos en la pantalla. 🚀')
        if (!chrono2.running) startChrono(2)
        advanceFlow(7)
        highlightAllTargets()
        return
      }
    }

    // Scheduling requests
    if (text.includes('agendar') || text.includes('llamada') || text.includes('reunion') || text.includes('cita')) {
      updateCompanionBubble(heard + '¡Entendido! Señalé el botón de <strong>"Agendar"</strong> en la pantalla. Haz clic allí para programar nuestra llamada. 📅')
      highlightScheduleButton()
      return
    }

    // "¿Qué eres?" / "¿para qué sirves?"
    if (text.includes('beneficio') || text.includes('ventajas') || text.includes('funcion') || text.includes('funciones') || text.includes('para que sirve') || text.includes('que es esto') || text.includes('que es judis') || text.includes('que eres') || text.includes('que haces') || text.includes('quien eres')) {
      updateCompanionBubble(heard + 'Soy un asistente que te ayuda a finalizar las acciones de usuarios en tu página, tipo guiarte en una compra o solucionar dudas complejas sin fricciones. 🚀')
      return
    }

    // Not understood — nudge towards whatever the flow is waiting for
    const nudge = flowStep < 6
      ? 'Por ahora solo te acompaño: encuentra los 3 productos y luego actívame para ayudarte de verdad. 😊'
      : found2.size < 3
        ? 'Di <strong>"ayuda"</strong> y te señalo los 3 productos. 😊'
        : askedForCheapest
          ? 'Puedes pedirme <strong>"agendar"</strong> para coordinar una reunión. 😊'
          : 'Pregúntame <strong>¿cuál es el más barato?</strong> y te lo señalo. 😊'
    updateCompanionBubble(heard + nudge)
  }

  function simulateTranscriptionResponse(errorReason) {
    if (errorReason) console.warn('[J.U.D.I.S Speech] recording failed:', errorReason)
    debugFailure(errorReason || 'sin resultado')
  }

  /* ─────────────────────────────────────────────────
     KEYBOARD HOTKEY (J + U)
  ───────────────────────────────────────────────── */
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
    if (!keysPressed['j'] || !keysPressed['u']) {
      stopAndProcessRecording()
    }
  })

  /* ─────────────────────────────────────────────────
     INITIALIZATION
  ───────────────────────────────────────────────── */
  function init() {
    buildGrid('grid-1', false)

    // Round 1 start button
    const btn1 = document.getElementById('btn-start-1')
    if (btn1) {
      btn1.addEventListener('click', () => {
        if (!chrono1.running) startChrono(1)
      })
    }

    // Round 2 start button — J.U.D.I.S explains she is waiting to be asked
    const btn2 = document.getElementById('btn-start-2')
    if (btn2) {
      btn2.addEventListener('click', () => {
        if (chrono2.running) return
        startChrono(2)
        updateCompanionState('speaking')
        const askMsg = isMobileViewport()
          ? 'Mantén presionado el rombo, di <strong>"ayuda"</strong> y te señalo los 3 objetos.'
          : 'Presiona <strong>J + U</strong>, di <strong>"ayuda"</strong> y te señalo los 3 objetos.'
        updateCompanionBubble(askMsg)
      })
    }

    // "Sí, habilitar" card — this is where J.U.D.I.S enters the demo
    const enableBtn = document.getElementById('btn-enable-luzia')
    const walletCardEl = document.getElementById('wallet-card')
    if (enableBtn) {
      enableBtn.addEventListener('click', () => {
        if (walletCardEl) walletCardEl.classList.add('enabled')
        enableBtn.textContent = 'Habilitado'
        saveAnalytics({
          max_section: 3,
          is_luzia_enabled: true
        })

        // Reveal round 2 before she speaks, so the grid is already there
        const secLuzia = document.getElementById('sec-luzia')
        if (secLuzia) {
          secLuzia.classList.remove('hidden-sec')
          buildGrid('grid-2', true)
          setTimeout(() => secLuzia.scrollIntoView({ behavior: 'smooth' }), 300)
        }

        advanceFlow(6)
      })
    }

    // Avatar Press and Hold Interaction (For Mobile and Touch Support)
    const compOrbEl = companionEl ? companionEl.querySelector('.comp-orb') : null
    let lastPressTime = 0
    let isPressing = false
    if (compOrbEl) {
      compOrbEl.addEventListener('contextmenu', (e) => e.preventDefault())

      const getEventCoords = (e) => {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
        if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
        return { x: e.clientX, y: e.clientY }
      }

      const handlePressStart = (e) => {
        if (!isJudisEnabled) return
        getAudioContext()

        const now = Date.now()
        if (now - lastPressTime < 300) {
          e.preventDefault()
          return
        }
        lastPressTime = now

        e.preventDefault()
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

    // Close bubble button
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

    // Final card schedule button
    const scheduleMeetingBtn = document.getElementById('btn-schedule-meeting')
    if (scheduleMeetingBtn) {
      scheduleMeetingBtn.addEventListener('click', (e) => {
        e.preventDefault()
        window.open('https://calendly.com/datactar/30min', '_blank')
      })
    }

    console.log('[J.U.D.I.S Demo] initialized successfully.')

    // ═══════════════════════════════════════════
    // The rombo is there from the start: it introduces J.U.D.I.S and sets
    // the scene before round 1. It only narrates, though — the search of
    // round 1 is done alone, which is what makes the final time comparison
    // meaningful.
    // ═══════════════════════════════════════════
    setTimeout(() => advanceFlow(1), 800)
  }

  // Go
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

})()
