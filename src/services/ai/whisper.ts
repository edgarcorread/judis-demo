import { SpeechClient } from '@google-cloud/speech'

const GCP_PROJECT = process.env.GCP_PROJECT ?? 'peya-data-ops-stg'

let speechClient: SpeechClient | null = null

function getClient(): SpeechClient {
  if (!speechClient) {
    // Usa GOOGLE_APPLICATION_CREDENTIALS automáticamente si está seteado
    speechClient = new SpeechClient({ projectId: GCP_PROJECT })
  }
  return speechClient
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const client = getClient()

  // El audio viene en webm/opus desde el MediaRecorder del browser
  const [response] = await client.recognize({
    config: {
      encoding: 'WEBM_OPUS' as any,
      sampleRateHertz: 48000,
      languageCode: 'es-AR',
      enableAutomaticPunctuation: true
    },
    audio: {
      content: audioBuffer.toString('base64')
    }
  })

  const transcript = response.results
    ?.map((r) => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim()

  if (!transcript) throw new Error('Google Speech no devolvió transcripción')
  return transcript
}
