import fs from 'fs'
import path from 'path'
import { convertDocumentToFlow } from '../services/ai'

export interface FlowMeta {
  file: string
  name: string
  description: string
  steps: number
  updatedAt: number
}

function flowsDir(): string {
  const dir = path.join(process.cwd(), 'skills', 'flows')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'proceso'
}

function parseFlow(content: string): { name: string; description: string; steps: number } {
  const nameMatch = content.match(/^#\s+(.+)$/m)
  const descMatch = content.match(/^>\s+(.+)$/m)
  const steps = (content.match(/^\d+\.\s/gm) ?? []).length
  return {
    name: nameMatch?.[1].trim() ?? 'Proceso sin nombre',
    description: descMatch?.[1].trim() ?? '',
    steps
  }
}

export function listFlows(): FlowMeta[] {
  const dir = flowsDir()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const full = path.join(dir, f)
      const content = fs.readFileSync(full, 'utf-8')
      const meta = parseFlow(content)
      return { file: f, ...meta, updatedAt: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteFlow(file: string): void {
  // Solo nombres de archivo planos dentro de skills/flows
  const safe = path.basename(file)
  const full = path.join(flowsDir(), safe)
  if (fs.existsSync(full)) fs.unlinkSync(full)
}

export function flowPath(file: string): string {
  return path.join(flowsDir(), path.basename(file))
}

/** Importa un documento (pdf/md/txt) y lo convierte en un flujo aprendido. */
export async function importFlow(filePath: string): Promise<FlowMeta> {
  const ext = path.extname(filePath).toLowerCase()
  const buffer = fs.readFileSync(filePath)

  let markdown: string
  if (ext === '.pdf') {
    markdown = await convertDocumentToFlow({ kind: 'pdf', data: buffer })
  } else if (ext === '.md' || ext === '.txt') {
    markdown = await convertDocumentToFlow({ kind: 'text', text: buffer.toString('utf-8') })
  } else {
    throw new Error(`Formato no soportado: ${ext}. Usa PDF, Markdown o TXT.`)
  }

  const meta = parseFlow(markdown)
  const file = `${slugify(meta.name)}.md`
  fs.writeFileSync(path.join(flowsDir(), file), markdown, 'utf-8')
  console.log(`[capaz] Flujo importado: ${file} ("${meta.name}", ${meta.steps} pasos)`)
  return { file, ...meta, updatedAt: Date.now() }
}

/**
 * Contexto de procesos aprendidos para el system prompt.
 * Mientras haya pocos flujos se incluyen completos; al escalar, esto pasa a ser un índice + carga selectiva.
 */
export function flowsSystemContext(): string {
  const flows = listFlows()
  if (!flows.length) return ''

  const MAX_CHARS = 12_000
  let body = ''
  for (const f of flows) {
    const content = fs.readFileSync(flowPath(f.file), 'utf-8').trim()
    if (body.length + content.length > MAX_CHARS) {
      body += `\n---\n# ${f.name}\n> ${f.description}\n(contenido omitido por espacio)\n`
      continue
    }
    body += `\n---\n${content}\n`
  }

  return `## Procesos aprendidos de esta organización
Cuando la petición del aprendiz coincida con uno de estos procesos, úsalo como fuente AUTORITATIVA para la guía paso a paso (sigue sus pasos y notas en vez de tu conocimiento general). Igual verifica cada pantalla en la captura antes de dictar el paso.
${body}`
}
