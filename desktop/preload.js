// desktop/preload.js — secure bridge between renderer and main process
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  serverHealth: () => ipcRenderer.invoke('server-health'),
  backendStatus: () => ipcRenderer.invoke('backend-status:get'),
  retryBackendStart: () => ipcRenderer.invoke('backend-status:retry'),
  onBackendStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('backend-status', listener);
    return () => ipcRenderer.removeListener('backend-status', listener);
  },
  platform:     () => process.platform,
  version:      () => process.env.npm_package_version || '2.0.0',
});
