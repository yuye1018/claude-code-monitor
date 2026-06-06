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
  console.log('Claude Code Monitor - Hook Setup\n');
  console.log(`Settings file: ${SETTINGS_PATH}`);
  console.log(`Hook script:   ${HOOK_SCRIPT}\n`);

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      console.log('Found existing settings.json');
    } catch (e) {
      console.error('Failed to parse settings.json:', e.message);
      process.exit(1);
    }
  } else {
    console.log('No existing settings.json, creating new one');
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  if (!settings.hooks) settings.hooks = {};

  for (const event of HOOK_EVENTS) {
    const existing = settings.hooks[event];
    if (Array.isArray(existing) && existing.some(hasOurHook)) {
      console.log(`  [skip] ${event} - hook already configured`);
    } else {
      if (!Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = [];
      }
      settings.hooks[event].push(buildHookEntry(event));
      console.log(`  [add]  ${event}`);
    }
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`\nDone! Settings saved to ${SETTINGS_PATH}`);
  console.log('Restart Claude Code for hooks to take effect.');
}

main();
