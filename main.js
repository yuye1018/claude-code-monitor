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
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10分钟无活动 → 自动关闭
let events = [];
let mainWindow = null;
let tray = null;
let expressServer = null;
let lastEventTime = null;
let idleTimer = null;

// ── Express 服务器 ────────────────────────────────────────
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

// ── 事件处理 ────────────────────────────────────────
// 使用 Notification 事件中的 permission_prompt 来检测 Claude 何时需要用户确认
let windowShownForPermission = false;

function handleEvent(event) {
  switch (event.type) {
    case 'PreToolUse':
      // 为新的工具使用重置状态
      windowShownForPermission = false;
      break;
    case 'Notification':
      // 检查这是否是 Claude 的权限提示
      if (event.data?.notification_type === 'permission_prompt') {
        windowShownForPermission = true;
        showWindow();
        const toolName = event.data?.message || 'Claude Code 需要确认';
        sendNotification('Claude Code 需要确认', toolName);
      }
      break;
    case 'PostToolUse':
      // 工具已执行 - 如果窗口因权限提示显示，则隐藏
      if (windowShownForPermission) {
        windowShownForPermission = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
          }, 300);
        }
      }
      break;
    case 'Stop':
      windowShownForPermission = false;
      showWindow();
      sendNotification('Claude Code 任务完成', '请查看终端获取详情');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      }, 8000);
      break;
    case 'Notification':
      // 常规通知（非权限提示）
      if (event.data?.message && event.data?.notification_type !== 'permission_prompt') {
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

// ── 空闲自动关闭 ────────────────────────────────────
// 如果10分钟内没有事件，说明 Claude Code 已停止 → 关闭监控器
function resetIdleTimer() {
  lastEventTime = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(autoShutdown, IDLE_TIMEOUT_MS);
}

function autoShutdown() {
  if (!lastEventTime) return;
  const elapsed = Date.now() - lastEventTime;
  if (elapsed >= IDLE_TIMEOUT_MS - 1000) {
    console.log('空闲超时 - Claude Code 似乎已停止。正在关闭监控器。');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
  }
}

// ── 托盘图标 ─────────────────────────────────────────────
function createTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  return nativeImage.createFromPath(iconPath);
}

// ── 窗口 ────────────────────────────────────────────────
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

// ── IPC 通信 ───────────────────────────────────────────────────
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

// ── 应用生命周期 ─────────────────────────────────────────
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

// ── 自动配置 Hooks ─────────────────────────────────────
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
