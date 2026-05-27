// desktop/preload.js — secure bridge between renderer and main process
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  serverHealth:     () => ipcRenderer.invoke('server-health'),
  backendStatus:    () => ipcRenderer.invoke('backend-status:get'),
  retryBackendStart:() => ipcRenderer.invoke('backend-status:retry'),
  onBackendStatus:  (cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('backend-status', fn);
    return () => ipcRenderer.removeListener('backend-status', fn);
  },
  platform: () => process.platform,
  version:  () => process.env.npm_package_version || '2.0.0',

  // Auto-updater
  updaterCheck:   () => ipcRenderer.invoke('updater:check'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus:(cb) => {
    const fn = (_e, p) => cb(p);
    ipcRenderer.on('updater-status', fn);
    return () => ipcRenderer.removeListener('updater-status', fn);
  },
});
