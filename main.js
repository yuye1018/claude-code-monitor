const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  Notification, ipcMain, screen, nativeTheme
} = require('electron');
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const PORT = 3456;
const MAX_EVENTS = 100;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle → auto shutdown
let events = [];
let mainWindow = null;
let tray = null;
let expressServer = null;
let lastEventTime = null;
let idleTimer = null;

// ── Express Server ────────────────────────────────────────
const server = express();
server.use(express.json({ limit: '10mb' }));

server.post('/event', (req, res) => {
  const eventType = req.query.type || req.body.event || 'Unknown';
  const event = {
    id: Date.now(),
    type: eventType,
    data: req.body,
    timestamp: new Date().toISOString()
  };

  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('event', event);
  }

  handleEvent(event);
  resetIdleTimer();
  res.json({ ok: true, id: event.id });
});

server.get('/events', (req, res) => {
  res.json(events);
});

server.post('/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
  }, 500);
});

server.get('/ping', (req, res) => {
  res.json({ ok: true });
});

// ── Event Handling ────────────────────────────────────────
const CONFIRM_DELAY_MS = 1500;
let pendingConfirmTimer = null;

function handleEvent(event) {
  switch (event.type) {
    case 'PreToolUse':
      // Delay notification — if PostToolUse comes quickly, it's auto-approved → cancel
      if (pendingConfirmTimer) clearTimeout(pendingConfirmTimer);
      const toolName = event.data?.tool_name || '未知';
      pendingConfirmTimer = setTimeout(() => {
        pendingConfirmTimer = null;
        showWindow();
        sendNotification('Claude Code 需要确认', `工具: ${toolName}`);
      }, CONFIRM_DELAY_MS);
      break;
    case 'PostToolUse':
      // Tool executed — if auto-approved, this fires fast → cancel the pending notification
      if (pendingConfirmTimer) {
        clearTimeout(pendingConfirmTimer);
        pendingConfirmTimer = null;
      }
      break;
    case 'Stop':
      if (pendingConfirmTimer) {
        clearTimeout(pendingConfirmTimer);
        pendingConfirmTimer = null;
      }
      showWindow();
      sendNotification('Claude Code 任务完成', '请查看终端获取详情');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      }, 8000);
      break;
    case 'Notification':
      if (event.data?.message) {
        sendNotification('Claude Code 通知', String(event.data.message));
      }
      break;
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  positionWindow();
  mainWindow.show();
  mainWindow.focus();
}

function positionWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow.setPosition(width - 380, height - 500);
}

function sendNotification(title, body) {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => showWindow());
    n.show();
  }
}

// ── Idle Auto-Shutdown ────────────────────────────────────
// If no events for 10 minutes, Claude Code is gone → shut down
function resetIdleTimer() {
  lastEventTime = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(autoShutdown, IDLE_TIMEOUT_MS);
}

function autoShutdown() {
  if (!lastEventTime) return;
  const elapsed = Date.now() - lastEventTime;
  if (elapsed >= IDLE_TIMEOUT_MS - 1000) {
    console.log('Idle timeout - Claude Code appears to have stopped. Shutting down.');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
  }
}

// ── Tray Icon ─────────────────────────────────────────────
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  return nativeImage.createFromPath(iconPath);
}

// ── Window ────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 480,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a2e' : '#f0f0f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  positionWindow();
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Code Monitor');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => showWindow() },
    { type: 'separator' },
    { label: '退出', click: () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      app.quit();
    }}
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => showWindow());
}

// ── IPC ───────────────────────────────────────────────────
ipcMain.handle('get-events', () => events);
ipcMain.handle('clear-events', () => { events = []; return true; });
ipcMain.handle('hide-window', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('get-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }
});

ipcMain.handle('focus-terminal', (_, ppid) => {
  if (!ppid) return false;
  const script = path.join(__dirname, 'focus-window.ps1');
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, String(ppid)],
    { timeout: 5000, windowsHide: true }, (err) => {
      if (err) console.error('focus-terminal failed:', err.message);
    });
  return true;
});

// ── App Lifecycle ─────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupHooksIfNeeded();

  expressServer = server.listen(PORT, () => {
    console.log(`Claude Code Monitor listening on http://localhost:${PORT}`);
  });

  expressServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} in use, trying ${PORT + 1}...`);
      expressServer = server.listen(PORT + 1, () => {
        console.log(`Claude Code Monitor listening on http://localhost:${PORT + 1}`);
      });
    }
  });
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  if (expressServer) expressServer.close();
});

// ── Auto Hooks Setup ─────────────────────────────────────
function setupHooksIfNeeded() {
  const marker = path.join(os.homedir(), '.claude-code-monitor-setup');
  if (fs.existsSync(marker)) return;

  const hookScript = path.join(__dirname, 'hook.js').replace(/\\/g, '/');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const events = ['PreToolUse', 'PostToolUse', 'Stop', 'Notification'];

  let settings = {};
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch { return; }

  if (!settings.hooks) settings.hooks = {};

  let changed = false;
  for (const event of events) {
    const existing = settings.hooks[event];
    const already = Array.isArray(existing) && existing.some(g =>
      g.hooks && g.hooks.some(h => h.command && h.command.includes('claude-code-monitor'))
    );
    if (already) continue;

    const entry = {
      hooks: [{ type: 'command', command: `node "${hookScript}" ${event}` }]
    };
    if (event === 'PreToolUse') entry.matcher = 'Edit|Write|Bash|NotebookEdit';

    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    settings.hooks[event].push(entry);
    changed = true;
  }

  if (changed) {
    try {
      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      fs.writeFileSync(marker, new Date().toISOString());
      console.log('Claude Code hooks configured automatically.');
      sendNotification('Claude Code Monitor', 'Hooks 已自动配置，重启 Claude Code 生效');
    } catch (e) {
      console.error('Failed to configure hooks:', e.message);
    }
  } else {
    fs.writeFileSync(marker, new Date().toISOString());
  }
}
