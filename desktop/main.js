// desktop/main.js — ACC v2 Electron Desktop App
'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require('electron');
const path  = require('path');
const http  = require('http');
const fs    = require('fs');
const { spawn } = require('child_process');

const ROOT    = path.join(__dirname, '..');
const UI_DIST = path.join(ROOT, 'ui', 'dist', 'index.html');
const PM2_CMD = 'C:\\Users\\Shaya\\AppData\\Roaming\\npm\\pm2.cmd';

let win  = null;
let tray = null;

// ── Health check ──────────────────────────────────────────────────────────────
function serverOk(cb) {
  const req = http.request(
    { hostname: 'localhost', port: 4000, path: '/api/health', timeout: 2000 },
    (res) => { res.resume(); cb(res.statusCode === 200); }
  );
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
  req.end();
}

// ── Ensure backend is running via PM2 (or direct node) ───────────────────────
function ensureBackend() {
  serverOk((running) => {
    if (running) { console.log('[acc] server already on :4000'); return; }
    console.log('[acc] starting backend...');
    // Try PM2 first
    const pm2 = spawn(PM2_CMD, ['restart', 'all'], { shell: true, stdio: 'ignore', cwd: ROOT });
    pm2.on('error', () => {
      // Fallback: direct node
      const srv = spawn(process.execPath.replace('electron.exe','node.exe').replace('electron','node'),
        [path.join(ROOT, 'scripts', 'start.js')],
        { stdio: 'ignore', detached: true, cwd: ROOT }
      );
      srv.unref();
    });
  });
}

// ── Create window ─────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        960,
    minHeight:       600,
    backgroundColor: '#0A0A0F',
    title:           'ACC v2 — Agent Command Center',
    show:            false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,   // allows file:// to call http://localhost:4000
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  // Always load from built dist — no dev server dependency
  win.loadFile(UI_DIST);

  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });

  // External links → browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  buildMenu();
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ACC',
      submenu: [
        { label: 'Reload UI',  accelerator: 'F5',        click: () => win?.reload() },
        { label: 'Dev Tools',  accelerator: 'F12',       click: () => win?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Quit ACC',   accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuiting = true; app.quit(); } },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Task Router',  click: () => win?.webContents.executeJavaScript('if(window.__ACC_NAV__)window.__ACC_NAV__("router")') },
        { label: 'Dashboard',   click: () => win?.webContents.executeJavaScript('if(window.__ACC_NAV__)window.__ACC_NAV__("dashboard")') },
        { label: 'Vault',       click: () => win?.webContents.executeJavaScript('if(window.__ACC_NAV__)window.__ACC_NAV__("vault")') },
        { label: 'History',     click: () => win?.webContents.executeJavaScript('if(window.__ACC_NAV__)window.__ACC_NAV__("history")') },
        { type: 'separator' },
        { label: 'Zoom In',     role: 'zoomIn' },
        { label: 'Zoom Out',    role: 'zoomOut' },
        { label: 'Reset Zoom',  role: 'resetZoom' },
        { label: 'Fullscreen',  role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Services',
      submenu: [
        { label: 'API Health',  click: () => shell.openExternal('http://localhost:4000/api/health') },
        { label: 'Task Bus',    click: () => shell.openExternal('http://localhost:4000/api/taskbus/stats') },
        { label: 'Telegram Bot',click: () => shell.openExternal('https://t.me/OurAccbot') },
      ],
    },
  ]));
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a small colored square as icon (works without external file)
  const img  = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  const icon = img.isEmpty() ? nativeImage.createEmpty() : img;
  tray = new Tray(icon);
  tray.setToolTip('ACC v2 — Agent Command Center');
  const menu = Menu.buildFromTemplate([
    { label: '🤖 Open ACC v2',   click: () => { if (!win) createWindow(); else win.show(); } },
    { type: 'separator' },
    { label: '❤️ Server Health', click: () => shell.openExternal('http://localhost:4000/api/health') },
    { label: '📋 Task Bus',      click: () => shell.openExternal('http://localhost:4000/api/taskbus/stats') },
    { label: '📱 Telegram Bot',  click: () => shell.openExternal('https://t.me/OurAccbot') },
    { type: 'separator' },
    { label: '❌ Quit',          click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (!win) createWindow(); else win.show(); });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('server-health', () => new Promise(serverOk));

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureBackend();
  createTray();
  createWindow();
});

app.on('window-all-closed', () => {
  // Windows: stay in tray unless user explicitly quit
  if (process.platform === 'darwin' || app.isQuiting) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => { app.isQuiting = true; });
