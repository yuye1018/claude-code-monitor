const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_DIR = path.resolve(__dirname);
const HOOK_SCRIPT = path.join(PROJECT_DIR, 'hook.js').replace(/\\/g, '/');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Stop', 'Notification'];

function buildHookEntry(event) {
  const entry = {
    matcher: event === 'PreToolUse' ? 'Edit|Write|Bash|NotebookEdit' : '',
    hooks: [{
      type: 'command',
      command: `node "${HOOK_SCRIPT}" ${event}`
    }]
  };
  if (!entry.matcher) delete entry.matcher;
  return entry;
}

function hasOurHook(group) {
  return group && group.hooks && group.hooks.some(h =>
    h.command && h.command.includes('claude-code-monitor') && h.command.includes('hook.js')
  );
}

function main() {
  console.log('Claude Code Monitor - Hook 配置\n');
  console.log(`设置文件: ${SETTINGS_PATH}`);
  console.log(`Hook 脚本: ${HOOK_SCRIPT}\n`);

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      console.log('找到已存在的 settings.json');
    } catch (e) {
      console.error('解析 settings.json 失败:', e.message);
      process.exit(1);
    }
  } else {
    console.log('没有已存在的 settings.json，创建新文件');
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  if (!settings.hooks) settings.hooks = {};

  for (const event of HOOK_EVENTS) {
    const existing = settings.hooks[event];
    if (Array.isArray(existing) && existing.some(hasOurHook)) {
      console.log(`  [跳过] ${event} - hook 已配置`);
    } else {
      if (!Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = [];
      }
      settings.hooks[event].push(buildHookEntry(event));
      console.log(`  [添加]  ${event}`);
    }
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`\n完成！设置已保存到 ${SETTINGS_PATH}`);
  console.log('重启 Claude Code 以使 hooks 生效。');
}

main();
