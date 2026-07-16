import './styles.css'

interface HotspotPayload {
  id: number
  x: number
  y: number
  label?: string
}

interface CapazOverlayAPI {
  onHotspots: (cb: (spots: HotspotPayload[]) => void) => void
  onHotspotHit: (cb: (id: number) => void) => void
}

// El preload expone la API completa; el overlay solo usa hotspots
const capaz = (window as unknown as { capaz: CapazOverlayAPI }).capaz

const root = document.getElementById('overlay')!
const elements = new Map<number, HTMLElement>()

function render(spots: HotspotPayload[]): void {
  root.innerHTML = ''
  elements.clear()

  for (const spot of spots) {
    const el = document.createElement('div')
    el.className = 'hotspot'
    el.style.left = `${spot.x}px`
    el.style.top = `${spot.y}px`

    const ring = document.createElement('div')
    ring.className = 'ring'
    el.appendChild(ring)

    const dot = document.createElement('div')
    dot.className = 'dot'
    el.appendChild(dot)

    if (spot.label) {
      const label = document.createElement('div')
      label.className = 'label'
      label.textContent = spot.label
      el.appendChild(label)
    }

    root.appendChild(el)
    elements.set(spot.id, el)
  }
}

function markHit(id: number): void {
  const el = elements.get(id)
  if (!el) return
  elements.delete(id)

  el.classList.add('hit')
  const check = document.createElement('div')
  check.className = 'check'
  check.textContent = '✓'
  el.appendChild(check)

  setTimeout(() => el.remove(), 900)
}

capaz.onHotspots((spots) => {
  console.log(`[capaz] Hotspots recibidos: ${spots.length}`)
  render(spots)
})

capaz.onHotspotHit((id) => {
  console.log(`[capaz] Hotspot cumplido: ${id}`)
  markHit(id)
})

console.log('[capaz] Overlay listo')
