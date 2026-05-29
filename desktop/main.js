// desktop/main.js — ACC Desktop (thin shell → acccommand.center)
// Loads the live Railway deployment. No local backend. Always up to date.
'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require('electron');
const path   = require('path');
const https  = require('https');
const fs     = require('fs');
const { autoUpdater } = require('electron-updater');

const CLOUD_URL   = 'https://acccommand.center';
const HEALTH_URL  = `${CLOUD_URL}/api/health`;

let win  = null;
let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ── Logging ───────────────────────────────────────────────────────────────────
let logFilePath = null;
function log(msg) {
  try {
    if (!logFilePath) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logFilePath = path.join(dir, 'desktop.log');
    }
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

// ── Railway health check ──────────────────────────────────────────────────────
function checkHealth() {
  return new Promise((resolve) => {
    https.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        960,
    minHeight:       600,
    backgroundColor: '#0A0A0F',
    title:           'ACC — Agent Command Center | acccommand.center',
    show:            false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  win.loadURL(CLOUD_URL);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('closed', () => { win = null; });

  // Open external links in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(CLOUD_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  buildMenu();
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ACC',
      submenu: [
        { label: 'Reload',     accelerator: 'F5',           click: () => win?.reload() },
        { label: 'Hard Reload',accelerator: 'CmdOrCtrl+F5', click: () => win?.webContents.reloadIgnoringCache() },
        { label: 'Dev Tools',  accelerator: 'F12',          click: () => win?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Quit ACC',   accelerator: 'CmdOrCtrl+Q',  click: () => { app.isQuiting = true; app.quit(); } },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Dashboard',    click: () => win?.loadURL(`${CLOUD_URL}/dashboard`) },
        { label: 'Landing Page', click: () => win?.loadURL(`${CLOUD_URL}/landing`) },
        { label: 'API Health',   click: () => win?.loadURL(HEALTH_URL) },
        { type: 'separator' },
        { label: 'Zoom In',    role: 'zoomIn' },
        { label: 'Zoom Out',   role: 'zoomOut' },
        { label: 'Reset Zoom', role: 'resetZoom' },
        { label: 'Fullscreen', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Services',
      submenu: [
        { label: 'API Health',   click: () => shell.openExternal(HEALTH_URL) },
        { label: 'Task Bus',     click: () => shell.openExternal(`${CLOUD_URL}/api/taskbus/stats`) },
        { label: 'Telegram Bot', click: () => shell.openExternal('https://t.me/OurAccbot') },
        { label: 'Supabase',     click: () => shell.openExternal('https://supabase.com/dashboard/project/xacfnatsovuxqttnzdaw') },
        { label: 'Railway',      click: () => shell.openExternal('https://railway.app') },
      ],
    },
  ]));
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const img  = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  const icon = img.isEmpty() ? nativeImage.createEmpty() : img;
  tray = new Tray(icon);
  tray.setToolTip('ACC — Agent Command Center');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ACC',        click: () => { if (!win) createWindow(); else win.show(); } },
    { type: 'separator' },
    { label: 'API Health',      click: () => shell.openExternal(HEALTH_URL) },
    { label: 'Telegram Bot',    click: () => shell.openExternal('https://t.me/OurAccbot') },
    { type: 'separator' },
    { label: 'Quit',            click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (!win) createWindow(); else win.show(); });
}

// ── Auto-updater (electron shell updates via GitHub Releases) ─────────────────
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available',  (i) => { log(`updater: available v${i.version}`);  broadcast('updater-status', { status: 'available', version: i.version }); });
  autoUpdater.on('update-downloaded', (i) => { log(`updater: ready v${i.version}`);      broadcast('updater-status', { status: 'ready',     version: i.version }); });
  autoUpdater.on('update-not-available', () =>                                            broadcast('updater-status', { status: 'up-to-date' }));
  autoUpdater.on('error', (e) =>                                                          broadcast('updater-status', { status: 'error', message: e.message }));
  autoUpdater.on('download-progress', (p) =>                                              broadcast('updater-status', { status: 'downloading', percent: Math.round(p.percent) }));

  setTimeout(()  => autoUpdater.checkForUpdates(), 8000);
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload));
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('server-health',      () => checkHealth());
ipcMain.handle('updater:check',      () => { if (app.isPackaged) autoUpdater.checkForUpdates(); });
ipcMain.handle('updater:install',    () => autoUpdater.quitAndInstall(false, true));
ipcMain.handle('open-external',      (_, url) => shell.openExternal(url));

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  log('ACC desktop launching → ' + CLOUD_URL);
  createTray();
  createWindow();
  setupAutoUpdater();
});

app.on('second-instance', () => {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin' || app.isQuiting) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => { app.isQuiting = true; });
