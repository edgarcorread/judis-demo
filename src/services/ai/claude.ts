import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai'
import fs from 'fs'
import path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────
const GCP_PROJECT = process.env.GCP_PROJECT ?? 'peya-data-ops-stg'
const GCP_LOCATION = process.env.GCP_LOCATION ?? 'us-central1'
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash'

// ── System Prompt ─────────────────────────────────────────────────────────────
function loadSystemPrompt(): string {
  try {
    const templatePath = path.join(process.cwd(), 'skills', 'role-template.md')
    return fs.readFileSync(templatePath, 'utf-8').trim()
  } catch {
    return 'Eres LuzIA, una asistente IA integrada en PeYa Wallet. Responde en español, máximo 60 palabras, de forma clara y concisa.'
  }
}

function outputContract(imgWidth: number, imgHeight: number): string {
  return `## Formato de salida (obligatorio)
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional:
{"answer": "<tu respuesta al usuario>", "hotspots": [{"x": <int>, "y": <int>, "label": "<máx 4 palabras>"}], "guide": {"active": <bool>, "done": <bool>}}

Reglas de hotspots:
- Son puntos de la captura que quieres señalar visualmente (botones, campos, menús que mencionas en tu respuesta).
- Coordenadas en píxeles de la captura adjunta (${imgWidth}x${imgHeight}px), origen arriba-izquierda, apuntando al CENTRO del elemento.
- Incluye de 0 a 3. Si no hay nada que señalar, usa "hotspots": [].
- Cuando digas "haz click en X" o "ve a Y", SIEMPRE señala ese elemento con un hotspot.

## Modo guía (paso a paso)
- Activa la guía ("guide": {"active": true, "done": false}) cuando el usuario pida que lo acompañes en un proceso de varios pasos.
- En modo guía indica UN SOLO paso por turno, con exactamente UN hotspot sobre el elemento a clickear.
- Cuando el objetivo se cumpla, marca "guide": {"active": false, "done": true} y da un mensaje breve de celebración.
- Fuera de modo guía usa siempre "guide": {"active": false, "done": false}.`
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Hotspot {
  x: number
  y: number
  label?: string
}

export interface GuideInfo {
  active: boolean
  done: boolean
}

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant'
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
}

export interface ClaudeResponse {
  answer: string
  hotspots: Hotspot[]
  guide: GuideInfo
  tokensIn: number
  tokensOut: number
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface AskParams {
  history: ChatMessage[]
  question: string
  screenshotJpeg: Buffer
  imgWidth: number
  imgHeight: number
  extraSystem?: string
}

export interface FlowDocument {
  kind: 'pdf' | 'text'
  data?: Buffer
  text?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pruneImages(history: ChatMessage[]): ChatMessage[] {
  return history.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.inlineData ? { text: '[captura de pantalla anterior omitida]' } : p
    )
  }))
}

function parseResponse(
  raw: string,
  imgWidth: number,
  imgHeight: number
): { answer: string; hotspots: Hotspot[]; guide: GuideInfo } {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()

  try {
    const obj = JSON.parse(text)
    const answer = typeof obj.answer === 'string' && obj.answer.length > 0 ? obj.answer : raw
    const hotspots: Hotspot[] = Array.isArray(obj.hotspots)
      ? obj.hotspots
          .filter(
            (h: unknown): h is Record<string, unknown> =>
              typeof h === 'object' &&
              h !== null &&
              Number.isFinite((h as Record<string, unknown>).x) &&
              Number.isFinite((h as Record<string, unknown>).y)
          )
          .slice(0, 3)
          .map((h) => ({
            x: Math.min(Math.max(Number(h.x), 0), imgWidth),
            y: Math.min(Math.max(Number(h.y), 0), imgHeight),
            label: typeof h.label === 'string' ? h.label.slice(0, 40) : undefined
          }))
      : []
    const guide: GuideInfo = {
      active: obj.guide?.active === true,
      done: obj.guide?.done === true
    }
    return { answer, hotspots, guide }
  } catch {
    return { answer: raw, hotspots: [], guide: { active: false, done: false } }
  }
}

// ── Main: askClaude ───────────────────────────────────────────────────────────
export async function askClaude(params: AskParams): Promise<ClaudeResponse> {
  const { history, question, screenshotJpeg, imgWidth, imgHeight, extraSystem } = params

  const systemPrompt =
    `${loadSystemPrompt()}\n\n${outputContract(imgWidth, imgHeight)}` +
    (extraSystem ? `\n\n${extraSystem}` : '')

  const imageBase64 = screenshotJpeg.toString('base64')

  const userMessage: ChatMessage = {
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
      { text: question }
    ]
  }

  let raw = ''
  let tokensIn = 0
  let tokensOut = 0

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  let success = false

  if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
    try {
      console.log('[capaz] Intentando API de Anthropic Claude')
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const prunedHistory = pruneImages(history)

      const messages: Anthropic.MessageParam[] = []
      for (const m of prunedHistory) {
        const role = m.role === 'user' ? 'user' : 'assistant'
        const textContent = m.parts.map((p) => p.text ?? '').join('\n').trim()
        if (textContent) {
          messages.push({ role, content: textContent })
        }
      }

      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64
            }
          },
          { type: 'text', text: question }
        ]
      })

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })

      raw = response.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
      tokensIn = response.usage.input_tokens
      tokensOut = response.usage.output_tokens
      success = true
    } catch (err: any) {
      console.warn('[capaz] Anthropic API falló, usando fallback de OpenAI:', err?.message || err)
    }
  }

  if (!success && openaiKey) {
    console.log('[capaz] Usando API de OpenAI GPT-4o-mini')
    const openai = new OpenAI({ apiKey: openaiKey })
    const prunedHistory = pruneImages(history)

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ]

    for (const m of prunedHistory) {
      const role = m.role === 'user' ? 'user' : 'assistant'
      const textContent = m.parts.map((p) => p.text ?? '').join('\n').trim()
      if (textContent) {
        messages.push({ role, content: textContent })
      }
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
        },
        { type: 'text', text: question }
      ]
    })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages
    })

    raw = response.choices[0]?.message?.content ?? '(sin respuesta)'
    tokensIn = response.usage?.prompt_tokens ?? 0
    tokensOut = response.usage?.completion_tokens ?? 0
    success = true
  }

  if (!success) {
    console.log('[capaz] Usando VertexAI Google Gemini (fallback)')
    let vertexClient = new VertexAI({ project: GCP_PROJECT, location: GCP_LOCATION })
    const generativeModel = vertexClient.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.2,
        responseMimeType: 'application/json'
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    })

    const prunedHistory = pruneImages(history)
    const chat = generativeModel.startChat({
      history: prunedHistory.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: m.parts.map((p) => (p.inlineData ? p : { text: p.text ?? '' }))
      }))
    })

    const result = await chat.sendMessage(
      userMessage.parts.map((p) => (p.inlineData ? p : { text: p.text ?? '' }))
    )

    raw = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '(sin respuesta)'
    tokensIn = result.response.usageMetadata?.promptTokenCount ?? 0
    tokensOut = result.response.usageMetadata?.candidatesTokenCount ?? 0
  }

  const { answer, hotspots, guide } = parseResponse(raw, imgWidth, imgHeight)

  console.log(`[capaz] Respuesta (${tokensIn}→${tokensOut} tokens): "${answer}"`)

  const assistantMessage: ChatMessage = {
    role: 'model',
    parts: [{ text: raw }]
  }

  return { answer, hotspots, guide, tokensIn, tokensOut, userMessage, assistantMessage }
}

// ── convertDocumentToFlow ─────────────────────────────────────────────────────
const FLOW_FORMAT = `# <Nombre corto del proceso>

> <Descripción de una línea: cuándo aplica este proceso>

## Pasos
1. <acción concreta, ej: "Abre el menú Configuración (ícono de engranaje, arriba a la derecha)">
2. ...

## Notas
- <decisiones, excepciones o datos que el usuario debe saber>`

export async function convertDocumentToFlow(doc: FlowDocument): Promise<string> {
  const instruction = `Convierte este documento de proceso en un flujo guiado para un mentor de pantalla.
Devuelve ÚNICAMENTE markdown con exactamente esta estructura, en español:

${FLOW_FORMAT}

Reglas:
- Cada paso debe ser UNA acción observable en pantalla (un click, escribir en un campo, abrir un menú).
- Describe los elementos por su texto/apariencia, NUNCA por coordenadas.
- Si el documento tiene información que no es un paso (contexto, excepciones), va en Notas.
- Sé fiel al documento: no inventes pasos que no estén descritos o claramente implícitos.`

  const textContent = doc.text ?? ''

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  let raw = ''

  if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: instruction,
      messages: [{ role: 'user', content: textContent }]
    })
    raw = response.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
  } else if (openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey })
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: textContent }
      ]
    })
    raw = response.choices[0]?.message?.content ?? ''
  } else {
    let vertexClient = new VertexAI({ project: GCP_PROJECT, location: GCP_LOCATION })
    const generativeModel = vertexClient.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.1 }
    })
    const parts = doc.kind === 'pdf' && doc.data
      ? [
          { inlineData: { mimeType: 'application/pdf', data: doc.data.toString('base64') } },
          { text: instruction }
        ]
      : [{ text: `${instruction}\n\n--- DOCUMENTO ---\n${textContent}` }]
    const result = await generativeModel.generateContent({ contents: [{ role: 'user', parts }] })
    raw = result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  }

  if (!raw) throw new Error('No se pudo convertir el documento')

  const fence = raw.match(/```(?:markdown|md)?\s*([\s\S]*?)```/)
  return (fence ? fence[1].trim() : raw) + '\n'
}

