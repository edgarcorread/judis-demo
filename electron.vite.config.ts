import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          companion: resolve(__dirname, 'src/companion/index.html'),
          overlay: resolve(__dirname, 'src/overlay/index.html'),
          island: resolve(__dirname, 'src/island/index.html'),
          mem: resolve(__dirname, 'src/mem/index.html'),
          demo: resolve(__dirname, 'src/demo/index.html')
        }
      }
    }
  }
})
