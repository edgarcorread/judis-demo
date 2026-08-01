import OpenAI, { toFile } from 'openai'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('No se encontró OPENAI_API_KEY en el archivo .env')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('No se escuchó nada (audio vacío). Mantén presionado Control + Option mientras hablas.')
  }

  const openai = getOpenAIClient()

  // Convert Buffer to a File object accepted by OpenAI SDK using toFile helper
  const file = await toFile(audioBuffer, 'audio.webm', { type: 'audio/webm' })

  const response = await openai.audio.transcriptions.create({
    file: file,
    model: 'whisper-1',
    language: 'es'
  })

  const transcript = response.text?.trim()

  if (!transcript) {
    throw new Error('Whisper no devolvió ninguna transcripción')
  }

  return transcript
}

