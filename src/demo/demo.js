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
  let recognition = null
  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'es-ES'

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      console.log('[J.U.D.I.S Speech] Result:', transcript)
      processSpokenCommand(transcript)
    }

    recognition.onerror = (event) => {
      console.warn('[J.U.D.I.S Speech] Error:', event.error)
      updateCompanionState('speaking')
      updateCompanionBubble('Disculpa, no logré escucharte bien. ¿Podrías repetirlo?')
    }

    recognition.onend = () => {
      if (companionState === 'listening') {
        updateCompanionState('thinking')
      }
    }
  }

  async function startRecording() {
    if (isHotkeyActive) return
    isHotkeyActive = true
    updateCompanionState('listening')
    updateCompanionBubble('Escuchando...')

    if (recognition) {
      try {
        recognition.start()
      } catch (e) {
        console.warn('SpeechRecognition already started or error:', e)
      }
    } else {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? { mimeType: 'audio/webm;codecs=opus' } : {}
        mediaRecorder = new MediaRecorder(micStream, opts)
        audioChunks = []
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
        mediaRecorder.start(100)
      } catch (err) {
        console.warn('Microphone access not allowed or unavailable. Simulating audio capture.', err)
      }
    }
  }

  function stopAndProcessRecording() {
    if (!isHotkeyActive) return
    isHotkeyActive = false
    updateCompanionState('thinking')

    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {
        console.warn('SpeechRecognition stop failed', e)
        simulateTranscriptionResponse()
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = () => {
          if (micStream) {
            micStream.getTracks().forEach(t => t.stop())
            micStream = null
          }
          mediaRecorder = null
          simulateTranscriptionResponse()
        }
        mediaRecorder.stop()
      } else {
        setTimeout(simulateTranscriptionResponse, 1000)
      }
    }
  }

  function processSpokenCommand(transcript) {
    updateCompanionState('speaking')
    const text = transcript.toLowerCase()

    if (text.includes('agendar') || text.includes('llamada') || text.includes('reunión') || text.includes('cita')) {
      updateCompanionBubble('¡Entendido! Señalé el botón de <strong>"Agendar"</strong> en la pantalla. Haz clic allí para programar nuestra llamada. 📅')
      highlightScheduleButton()
    } else if (text.includes('beneficio') || text.includes('para qué sirve') || text.includes('que es') || text.includes('qué es') || text.includes('que hace') || text.includes('qué hace') || text.includes('ventajas') || text.includes('sirve') || text.includes('función') || text.includes('funciones')) {
      updateCompanionBubble('Soy un asistente que te ayuda a finalizar las acciones de usuarios en tu página, tipo guiarte en una compra o solucionar dudas complejas sin fricciones. 🚀')
    } else if (text.includes('ayuda') || text.includes('objeto') || text.includes('producto') || text.includes('mostrar') || text.includes('buscar') || text.includes('guiar') || text.includes('iniciar') || text.includes('comenzar') || text.includes('detectar')) {
      updateCompanionBubble('¡Perfecto! Te guiaré secuencialmente para encontrar los 3 productos en la pantalla. 🚀')
      setTimeout(() => {
        if (!chrono2.running) {
          startChrono(2)
        }
        guideStep = 0
        triggerSequentialGuide()
      }, 1500)
    } else {
      updateCompanionBubble(`Escuché que dijiste: "<em>${transcript}</em>". Pero para ayudarte, necesito que me pidas ayuda para encontrar los objetos. 😊`);
    }
  }

  function simulateTranscriptionResponse() {
    updateCompanionState('speaking')
    updateCompanionBubble('Entendido. Te guiaré secuencialmente para encontrar los 3 productos más rápido. 🚀')

    // Automatically trigger sequential guide step 1 and start chrono 2
    setTimeout(() => {
      if (!chrono2.running) {
        startChrono(2)
      }
      guideStep = 0
      triggerSequentialGuide()
    }, 1500)
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
        ? '¡Hola! Soy J.U.D.I.S. <strong>Mantén presionada mi foto</strong> mientras hablas y <strong>suéltala</strong> al terminar para hablarme.'
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

      // Inform user how to trigger J.U.D.I.S via bubble
      const welcomeMsg = window.innerWidth <= 600
        ? '¡Hola! Soy J.U.D.I.S. <strong>Mantén presionada mi foto</strong> mientras hablas y <strong>suéltala</strong> al terminar para hablarme.'
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
            ? 'Pídeme <strong>"ayuda"</strong> manteniendo presionada mi foto.'
            : 'Pídeme <strong>"ayuda"</strong> presionando las teclas <strong>J + U</strong>.'
          updateCompanionBubble(askMsg)
        }
      })
    }

    // Avatar Press and Hold Interaction (For Mobile and Touch Support)
    const compOrbEl = companionEl ? companionEl.querySelector('.comp-orb') : null
    if (compOrbEl) {
      // Prevent context menu on long press
      compOrbEl.addEventListener('contextmenu', (e) => e.preventDefault())

      const handlePressStart = (e) => {
        if (!isJudisEnabled) return
        e.preventDefault()
        if (companionState === 'idle' || companionState === 'speaking') {
          startRecording()
        }
      }

      const handlePressEnd = (e) => {
        if (!isJudisEnabled) return
        e.preventDefault()
        if (companionState === 'listening') {
          stopAndProcessRecording()
        }
      }

      compOrbEl.addEventListener('mousedown', handlePressStart)
      compOrbEl.addEventListener('mouseup', handlePressEnd)
      compOrbEl.addEventListener('mouseleave', handlePressEnd)

      compOrbEl.addEventListener('touchstart', handlePressStart, { passive: false })
      compOrbEl.addEventListener('touchend', handlePressEnd, { passive: false })
      compOrbEl.addEventListener('touchcancel', handlePressEnd, { passive: false })
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
