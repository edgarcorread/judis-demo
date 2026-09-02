import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const repoRoot = process.cwd()
  const env = loadEnv(mode, repoRoot, '')
  const googleTtsKey = env.GOOGLE_TTS || env.GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS || env.GOOGLE_API_KEY || ''

  if (!googleTtsKey) {
    console.warn('\n[vite] ℹ️  No se encontró GOOGLE_TTS en el entorno — se usará la key escrita en demo.js (GOOGLE_TTS_KEY). Si esa también está vacía, la demo hablará con la voz sintética del navegador.\n')
  }

  return {
    // The app lives in src/demo, but .env and this config file live at the
    // repo root. The root MUST be set here rather than passed on the command
    // line (`vite build src/demo`): Vite resolves vite.config.js from the
    // root directory, so passing src/demo there made it look for the config
    // *inside src/demo*, find nothing, and silently build with no config at
    // all — which is why __GOOGLE_TTS_KEY__ was shipping unreplaced and the
    // demo always fell back to the browser voice.
    root: 'src/demo',
    envDir: repoRoot,
    define: {
      __GOOGLE_TTS_KEY__: JSON.stringify(googleTtsKey)
    }
  }
})
