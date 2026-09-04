const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskAPI', {
  isKiosk: true,
  onServerFound: (callback) => ipcRenderer.on('server-found', (_, data) => callback(data)),
  onKioskViolation: (callback) => ipcRenderer.on('kiosk-violation', (_, data) => callback(data)),
  connectToServer: (url) => ipcRenderer.send('connect-to-server', url),
  exitKiosk: (adminPassword) => ipcRenderer.send('exit-kiosk', adminPassword)
});
