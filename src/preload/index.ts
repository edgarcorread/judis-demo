import { contextBridge, ipcRenderer } from 'electron'

export interface AnswerPayload {
  answer: string
  question: string
  tokensIn: number
  tokensOut: number
  flow: boolean
}

export interface HotspotPayload {
  id: number
  x: number
  y: number
  label?: string
}

contextBridge.exposeInMainWorld('capaz', {
  onState: (cb: (state: string) => void) =>
    ipcRenderer.on('capaz:state', (_e, s) => cb(s)),

  onAnswer: (cb: (payload: AnswerPayload) => void) =>
    ipcRenderer.on('capaz:answer', (_e, p) => cb(p)),

  onError: (cb: (msg: string) => void) =>
    ipcRenderer.on('capaz:error', (_e, m) => cb(m)),

  onStopRecording: (cb: () => void) =>
    ipcRenderer.on('capaz:stop-recording', () => cb()),

  onHotspots: (cb: (spots: HotspotPayload[]) => void) =>
    ipcRenderer.on('capaz:hotspots', (_e, s) => cb(s)),

  onHotspotHit: (cb: (id: number) => void) =>
    ipcRenderer.on('capaz:hotspot-hit', (_e, id) => cb(id)),

  onFlip: (cb: (flip: { h: boolean; v: boolean }) => void) =>
    ipcRenderer.on('capaz:flip', (_e, f) => cb(f)),

  sendAudio: (buffer: ArrayBuffer | { text: string }) =>
    ipcRenderer.invoke('capaz:audio', buffer),

  dismiss: () =>
    ipcRenderer.send('capaz:ready-to-dismiss'),

  toggleInPage: (active: boolean) =>
    ipcRenderer.send('capaz:toggle-in-page', active),

  clickHotspot: (id: number) =>
    ipcRenderer.send('capaz:click-hotspot', id),

  startRecordingTrigger: () =>
    ipcRenderer.send('capaz:start-recording-trigger'),

  stopRecordingTrigger: () =>
    ipcRenderer.send('capaz:stop-recording-trigger'),

  sendText: (text: string) =>
    ipcRenderer.invoke('capaz:text-command', text)
})

export interface FlowMeta {
  file: string
  name: string
  description: string
  steps: number
  updatedAt: number
}

contextBridge.exposeInMainWorld('island', {
  setExpanded: (expanded: boolean) =>
    ipcRenderer.send('island:expand', expanded),

  listFlows: (): Promise<FlowMeta[]> =>
    ipcRenderer.invoke('flows:list'),

  deleteFlow: (file: string): Promise<FlowMeta[]> =>
    ipcRenderer.invoke('flows:delete', file),

  openFlow: (file: string): Promise<string> =>
    ipcRenderer.invoke('flows:open', file),

  importFlow: (): Promise<FlowMeta | null> =>
    ipcRenderer.invoke('flows:import')
})
