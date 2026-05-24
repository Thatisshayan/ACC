#!/usr/bin/env node
// Auto-restart monitor for ACC v2
// Run this in a loop: while true; node acc-monitor.js; sleep 60; done

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:4000/api/health', { timeout: 3000 }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function getBotHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:4000/api/telegram/status', { timeout: 3000 }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function restartServices() {
  console.log(`[${new Date().toISOString()}] ⚠️  Services down. Restarting...`);
  return new Promise((resolve) => {
    const pm2 = spawn('C:\\Users\\Shaya\\AppData\\Roaming\\npm\\pm2.cmd', ['restart', 'all']);
    setTimeout(() => resolve(true), 15000);
  });
}

async function monitor() {
  const health = await checkHealth();
  const time = new Date().toISOString();
  
  if (health) {
    console.log(`[${time}] ✅ ACC Server: ONLINE`);
  } else {
    console.log(`[${time}] ❌ ACC Server: OFFLINE — Restarting...`);
    await restartServices();
  }
}

// Run immediately and every 2 minutes
monitor();
setInterval(monitor, 120000);
