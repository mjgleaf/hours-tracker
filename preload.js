const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  geotabAuthenticate: (creds) => ipcRenderer.invoke('geotab-authenticate', creds),
  geotabCall: (params) => ipcRenderer.invoke('geotab-call', params),
});
