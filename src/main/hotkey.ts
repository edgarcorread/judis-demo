import { uIOhook, UiohookKey } from 'uiohook-napi'

let pttActive = false
let ctrlDown = false
let altDown = false

function isCtrl(keycode: number): boolean {
  return keycode === UiohookKey.Ctrl || keycode === UiohookKey.CtrlRight
}

function isAlt(keycode: number): boolean {
  return keycode === UiohookKey.Alt || keycode === UiohookKey.AltRight
}

export function registerHotkey(onDown: () => void, onUp: () => void, onMouseDown?: () => void): void {
  uIOhook.on('mousedown', () => {
    onMouseDown?.()
  })

  // Push-to-talk: mantener ⌃ Control + ⌥ Option
  uIOhook.on('keydown', (e) => {
    if (isCtrl(e.keycode)) ctrlDown = true
    if (isAlt(e.keycode)) altDown = true
    if (ctrlDown && altDown && !pttActive) {
      pttActive = true
      onDown()
    }
  })

  uIOhook.on('keyup', (e) => {
    if (isCtrl(e.keycode)) ctrlDown = false
    if (isAlt(e.keycode)) altDown = false
    // Soltar cualquiera de los dos termina la grabación
    if (pttActive && (!ctrlDown || !altDown)) {
      pttActive = false
      onUp()
    }
  })

  uIOhook.start()
  console.log('[capaz] Push-to-talk activo: mantén ⌃⌥ (Control+Option) para grabar')
}

export function unregisterAll(): void {
  uIOhook.stop()
}
