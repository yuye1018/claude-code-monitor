const eventsContainer = document.getElementById('events');
const statusText = document.getElementById('status-text');

let eventCount = 0;

const LABELS = {
  'PreToolUse': '⚠ 需要确认',
  'PostToolUse': '✅ 已执行',
  'Stop': '🏁 任务完成',
  'Notification': '🔔 通知'
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// 从 session_id 生成简短的会话标识符
function getSessionId(data) {
  const sessionId = data?.session_id;
  if (!sessionId) return '';
  // 提取 session_id 的最后 8 个字符作为简短标识符
  return sessionId.slice(-8);
}

function getDetail(data) {
  if (!data) return '';
  const input = data.tool_input || {};
  if (input.file_path) return input.file_path;
  if (input.command) return input.command;
  if (input.content) {
    const s = String(input.content);
    return s.length > 100 ? s.substring(0, 100) + '...' : s;
  }
  if (data.message) return String(data.message);
  return '';
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function renderEvent(event) {
  const cssClass = 'event-' + (event.type || '').toLowerCase().replace(/_/g, '-');
  const label = LABELS[event.type] || event.type;
  const tool = event.data?.tool_name || '';
  const detail = getDetail(event.data);
  const ppid = event.data?._ppid;
  const sessionId = getSessionId(event.data);

  const div = document.createElement('div');
  div.className = `event-item ${cssClass}`;
  div.innerHTML = `
    <div class="event-header">
      <span class="event-type">${label}${tool ? ' · ' + tool : ''}</span>
      <span class="event-time">${formatTime(event.timestamp)}</span>
    </div>
    ${sessionId ? `<div class="event-session">会话: ${sessionId}</div>` : ''}
    ${detail ? `<div class="event-detail">${escapeHtml(detail)}</div>` : ''}
  `;

  if (ppid) {
    div.classList.add('clickable');
    div.title = '点击跳转到终端';
    div.addEventListener('click', () => {
      window.monitor.focusTerminal(ppid);
    });
  }

  return div;
}

function addEvent(event) {
  const empty = eventsContainer.querySelector('.empty-state');
  if (empty) empty.remove();

  eventsContainer.insertBefore(renderEvent(event), eventsContainer.firstChild);
  eventCount++;
  statusText.textContent = `已收到 ${eventCount} 个事件`;
}

function clearAll() {
  eventsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📡</div>
      <p>等待 Claude Code 事件...</p>
      <p class="hint">启动 Claude Code 后，事件会自动出现在这里</p>
    </div>`;
  eventCount = 0;
  statusText.textContent = '已清除 · 等待事件';
}

// ── 初始化 ──────────────────────────────
async function init() {
  try {
    const history = await window.monitor.getEvents();
    if (history && history.length > 0) {
      const empty = eventsContainer.querySelector('.empty-state');
      if (empty) empty.remove();
      history.forEach(e => eventsContainer.insertBefore(renderEvent(e), eventsContainer.firstChild));
      eventCount = history.length;
      statusText.textContent = `已加载 ${eventCount} 个历史事件`;
    }
  } catch { /* 首次启动，无历史记录 */ }

  window.monitor.onEvent(addEvent);

  // 主题
  document.documentElement.setAttribute('data-theme', await window.monitor.getTheme());
  window.monitor.onThemeChanged((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
  });
}

document.getElementById('btn-close').addEventListener('click', () => window.monitor.hideWindow());
document.getElementById('btn-hide').addEventListener('click', () => window.monitor.hideWindow());
document.getElementById('btn-clear').addEventListener('click', () => {
  window.monitor.clearEvents();
  clearAll();
});

init();
