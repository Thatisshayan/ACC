// desktop/main.js — ACC v2 Electron Desktop App
'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require('electron');
const path  = require('path');
const http  = require('http');
const fs    = require('fs');
const { spawn } = require('child_process');

const DEV_ROOT = path.resolve(__dirname, '..');
const BACKEND_PORT = 4000;
const BACKEND_HEALTH_PATH = '/api/health';
const BACKEND_START_TIMEOUT_MS = 30000;
const BACKEND_CHECK_INTERVAL_MS = 1000;

const BACKEND_STATUS = Object.freeze({
  ONLINE: 'Online',
  STARTING: 'Starting',
  OFFLINE: 'Offline',
  FAILED: 'Failed',
});

let win  = null;
let tray = null;
let backendProcess = null;
let backendStartPromise = null;
let backendState = {
  status: BACKEND_STATUS.OFFLINE,
  detail: 'Checking backend...',
  lastCheckedAt: null,
};
let logFilePath = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function ensureDesktopLogFile() {
  if (logFilePath) return logFilePath;

  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, 'desktop.log');
  return logFilePath;
}

function appendDesktopLog(message) {
  try {
    const file = ensureDesktopLogFile();
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    console.error('[acc] log write failed:', err.message);
  }
}

function resolveUiDistPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ui', 'dist', 'index.html');
  }

  return path.join(DEV_ROOT, 'ui', 'dist', 'index.html');
}

// ── Health check ──────────────────────────────────────────────────────────────
function checkBackendHealth(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: BACKEND_PORT, path: BACKEND_HEALTH_PATH, timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ── Ensure backend is running via PM2 (or direct node) ───────────────────────
function notifyBackendStatus(status, detail, extra = {}) {
  backendState = {
    status,
    detail,
    lastCheckedAt: new Date().toISOString(),
    ...extra,
  };

  appendDesktopLog(`backend:${status} ${detail}`);

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send('backend-status', backendState);
  }
}

function findBackendRoot() {
  const pathCandidates = [
    DEV_ROOT,
    path.resolve(DEV_ROOT, '..'),
    path.resolve(DEV_ROOT, '..', '..'),
  ];

  if (process.resourcesPath) {
    pathCandidates.push(
      process.resourcesPath,
      path.resolve(process.resourcesPath, '..'),
      path.resolve(process.resourcesPath, '..', '..'),
      path.resolve(process.resourcesPath, '..', '..', '..'),
      path.resolve(process.resourcesPath, '..', '..', '..', '..'),
    );
  }

  const seen = new Set();
  for (const candidate of pathCandidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const startScript = path.join(resolved, 'scripts', 'start.js');
    const cloudServer = path.join(resolved, 'cloud', 'server.js');
    const expressPkg = path.join(resolved, 'node_modules', 'express', 'package.json');

    if (fs.existsSync(startScript) && fs.existsSync(cloudServer) && fs.existsSync(expressPkg)) {
      return resolved;
    }
  }

  return null;
}

function resolveNodeBin() {
  // Prefer a real node.exe from PATH over Electron-as-Node to avoid edge cases
  // on Windows where Electron's node emulation can behave differently.
  const candidates = ['node', 'node.exe'];
  for (const bin of candidates) {
    try {
      require('child_process').execFileSync(bin, ['--version'], { timeout: 3000, windowsHide: true });
      return bin;
    } catch (_) {}
  }
  // Fall back to Electron-as-Node
  return process.execPath;
}

function launchBackend(repoRoot) {
  const startScript = path.join(repoRoot, 'scripts', 'start.js');
  const nodeBin = resolveNodeBin();
  const child = spawn(nodeBin, [startScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      ACC_SKIP_TELEGRAM_BOT: '1',   // bot is on Railway; never start locally
      ELECTRON_RUN_AS_NODE: undefined, // don't leak this into the real node process
    },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();
  return child;
}

async function ensureBackend() {
  if (backendStartPromise) {
    return backendStartPromise;
  }

  backendStartPromise = (async () => {
    if (await checkBackendHealth()) {
      notifyBackendStatus(BACKEND_STATUS.ONLINE, `Backend already listening on http://localhost:${BACKEND_PORT}.`);
      return true;
    }

    notifyBackendStatus(BACKEND_STATUS.STARTING, `Starting the local backend on http://localhost:${BACKEND_PORT}...`);

    const repoRoot = findBackendRoot();
    if (!repoRoot) {
      notifyBackendStatus(
        BACKEND_STATUS.FAILED,
        'Backend start script not found. Open the ACC repo root and run npm install there if needed.'
      );
      return false;
    }

    let backendReachedOnline = false;

    try {
      backendProcess = launchBackend(repoRoot);
    } catch (err) {
      notifyBackendStatus(BACKEND_STATUS.FAILED, `Backend launch failed: ${err.message}`);
      return false;
    }

    backendProcess.once('error', (err) => {
      if (!backendReachedOnline) {
        notifyBackendStatus(BACKEND_STATUS.FAILED, `Backend launch failed: ${err.message}`);
      }
    });

    backendProcess.once('exit', (code, signal) => {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      if (!backendReachedOnline) {
        notifyBackendStatus(BACKEND_STATUS.FAILED, `Backend exited before it became online (${reason}).`);
      } else {
        notifyBackendStatus(
          BACKEND_STATUS.OFFLINE,
          `Backend stopped after launch (${reason}). Restart ACC to bring it back online.`
        );
      }
    });

    const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await checkBackendHealth()) {
        backendReachedOnline = true;
        notifyBackendStatus(BACKEND_STATUS.ONLINE, `Backend is online at http://localhost:${BACKEND_PORT}.`);
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, BACKEND_CHECK_INTERVAL_MS));
    }

    notifyBackendStatus(
      BACKEND_STATUS.FAILED,
      `Backend did not respond on http://localhost:${BACKEND_PORT} after startup. Run npm run start in the repo root and retry.`
    );
    return false;
  })().finally(() => {
    backendStartPromise = null;
  });

  return backendStartPromise;
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
  win.loadFile(resolveUiDistPath());
  win.webContents.once('did-finish-load', () => {
    win?.webContents.send('backend-status', backendState);
  });

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
ipcMain.handle('server-health', () => checkBackendHealth());
ipcMain.handle('backend-status:get', () => backendState);
ipcMain.handle('backend-status:retry', () => ensureBackend());

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  appendDesktopLog('desktop app launching');
  createTray();
  createWindow();
  ensureBackend().catch((err) => {
    notifyBackendStatus(BACKEND_STATUS.FAILED, `Backend bootstrap failed: ${err.message}`);
  });
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
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
