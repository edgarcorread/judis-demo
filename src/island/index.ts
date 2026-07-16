import './styles.css'

interface FlowMeta {
  file: string
  name: string
  description: string
  steps: number
  updatedAt: number
}

interface IslandAPI {
  setExpanded: (expanded: boolean) => void
  listFlows: () => Promise<FlowMeta[]>
  deleteFlow: (file: string) => Promise<FlowMeta[]>
  openFlow: (file: string) => Promise<string>
  importFlow: () => Promise<FlowMeta | null>
}

const island = (window as unknown as { island: IslandAPI }).island

const rootEl = document.getElementById('island')!
const countEl = document.getElementById('pill-count')!
const listEl = document.getElementById('flow-list')!
const statusEl = document.getElementById('panel-status')!
const importBtn = document.getElementById('btn-import') as HTMLButtonElement

let collapseTimer: ReturnType<typeof setTimeout> | null = null
let busy = false

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
    empty.textContent = 'Aún no le has enseñado procesos. Importa un documento para empezar — o pídele guías de tareas cotidianas por voz, eso ya lo sabe.'
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
    editBtn.title = 'Editar (abre el archivo)'
    editBtn.addEventListener('click', () => island.openFlow(flow.file))

    const delBtn = document.createElement('button')
    delBtn.className = 'delete'
    delBtn.textContent = '✕'
    delBtn.title = 'Eliminar proceso'
    delBtn.addEventListener('click', async () => {
      renderFlows(await island.deleteFlow(flow.file))
      setStatus(`"${flow.name}" eliminado`)
    })

    item.append(info, steps, editBtn, delBtn)
    listEl.appendChild(item)
  }
}

async function refresh(): Promise<void> {
  renderFlows(await island.listFlows())
}

importBtn.addEventListener('click', async () => {
  if (busy) return
  busy = true
  importBtn.disabled = true
  setStatus('⟳ Convirtiendo documento en flujo…')
  try {
    const flow = await island.importFlow()
    if (flow) {
      setStatus(`✓ "${flow.name}" aprendido (${flow.steps} pasos)`)
      await refresh()
    } else {
      setStatus('')
    }
  } catch (err) {
    console.error('[capaz] Error importando:', err)
    setStatus('Error al importar. Revisa la consola.', true)
  } finally {
    busy = false
    importBtn.disabled = false
  }
})

// ── Expandir / colapsar por hover ─────────────────────
rootEl.addEventListener('mouseenter', () => {
  if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null }
  if (rootEl.classList.contains('expanded')) return
  rootEl.classList.replace('collapsed', 'expanded')
  island.setExpanded(true)
  refresh()
})

rootEl.addEventListener('mouseleave', () => {
  if (busy) return // no colapsar en medio de una importación
  collapseTimer = setTimeout(() => {
    rootEl.classList.replace('expanded', 'collapsed')
    island.setExpanded(false)
  }, 350)
})

refresh()
console.log('[capaz] Isla lista')
