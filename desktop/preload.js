// desktop/preload.js — secure bridge between renderer and main process
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  serverHealth: () => ipcRenderer.invoke('server-health'),
  platform:     () => process.platform,
  version:      () => process.env.npm_package_version || '2.0.0',
});
