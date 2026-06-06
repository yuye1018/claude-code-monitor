const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitor', {
  onEvent: (callback) => {
    ipcRenderer.on('event', (_, data) => callback(data));
  },
  getEvents: () => ipcRenderer.invoke('get-events'),
  clearEvents: () => ipcRenderer.invoke('clear-events'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  focusTerminal: (ppid) => ipcRenderer.invoke('focus-terminal', ppid),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme-changed', (_, theme) => callback(theme));
  }
});
