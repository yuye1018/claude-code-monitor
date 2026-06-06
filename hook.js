const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const eventType = process.argv[2] || 'Unknown';
const port = parseInt(process.argv[3] || '3456');

const PROJECT_DIR = path.resolve(__dirname);

function ping() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/ping', method: 'GET', timeout: 1000
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function startMonitor() {
  const electronExe = path.join(PROJECT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
  const child = spawn(electronExe, ['.'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function sendEvent(body) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/event?type=${encodeURIComponent(eventType)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

function requestShutdown() {
  const req = http.request({
    hostname: '127.0.0.1', port, path: '/shutdown', method: 'POST', timeout: 2000
  }, (res) => res.resume());
  req.on('error', () => {});
  req.end();
}

async function main() {
  let data = '';
  process.stdin.setEncoding('utf8');
  await new Promise(resolve => {
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', resolve);
  });

  let body;
  try {
    const parsed = JSON.parse(data || '{}');
    parsed._ppid = process.ppid;
    body = JSON.stringify({ event: eventType, ...parsed });
  } catch {
    body = JSON.stringify({ event: eventType, raw: data, _ppid: process.ppid });
  }

  // Check if monitor is running, start if not
  let alive = await ping();
  if (!alive) {
    startMonitor();
    // Wait for Electron to boot and server to be ready
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if (await ping()) { alive = true; break; }
    }
  }

  // Send the event
  if (alive) {
    await sendEvent(body);
  }

  // On Stop event, shut down the monitor after a short delay
  if (eventType === 'Stop') {
    await sleep(3000);
    requestShutdown();
    await sleep(1000);
  }

  process.exit(0);
}

// Safety timeout
setTimeout(() => process.exit(0), 15000);

main();
