const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  onStateChange: (cb) => ipcRenderer.on('state-change', (_, state) => cb(state)),
  onThemeChange: (cb) => ipcRenderer.on('theme-change', (_, theme) => cb(theme)),
  onStyleChange: (cb) => ipcRenderer.on('style-change', (_, style) => cb(style)),
  setState: (state) => ipcRenderer.send('set-state', state),
})
