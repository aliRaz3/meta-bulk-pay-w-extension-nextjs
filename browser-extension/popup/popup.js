'use strict';

const DASHBOARD_URL_PATTERNS = globalThis.DashboardConfig?.getDashboardUrlPatterns?.() || [];
const DEFAULT_DASHBOARD_URL = globalThis.DashboardConfig?.getPreferredDashboardUrl?.() || 'http://localhost/';

function sw(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || {});
    });
  });
}

function getEl(id) {
  return document.getElementById(id);
}

function setBadge(state) {
  const badge = getEl('badge');
  if (!state) {
    badge.textContent = 'IDLE';
    badge.className = 'badge';
    return;
  }
  if (state.running) {
    badge.textContent = 'RUNNING';
    badge.className = 'badge running';
    return;
  }
  if (state.finishedAt) {
    badge.textContent = 'DONE';
    badge.className = 'badge done';
    return;
  }
  badge.textContent = 'READY';
  badge.className = 'badge';
}

function setStats(state) {
  const stats = state?.stats || {};
  getEl('st-total').textContent = String(stats.total || 0);
  getEl('st-pending').textContent = String(stats.pending || 0);
  getEl('st-success').textContent = String(stats.success || 0);
  getEl('st-failed').textContent = String(stats.failed || 0);

  const done = (stats.success || 0) + (stats.failed || 0) + (stats.skipped || 0);
  const total = stats.total || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  getEl('progFill').style.width = `${pct}%`;
  getEl('progPct').textContent = `${pct}%`;
  getEl('progLabel').textContent = total > 0 ? `${done}/${total} processed` : 'Load queue from dashboard';
}

function setLog(state) {
  const logBox = getEl('logBox');
  const entries = state?.log || [];
  if (entries.length === 0) {
    logBox.innerHTML = '<div class="muted">Waiting to start…</div>';
    return;
  }

  const tail = entries.slice(-12);
  logBox.innerHTML = tail
    .map((entry) => {
      const ts = new Date(entry.ts).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `<div><span class="log-ts">${ts}</span>${escapeHtml(entry.msg)}</div>`;
    })
    .join('');
  logBox.scrollTop = logBox.scrollHeight;
}

function render(state) {
  const nextState = state || null;
  setBadge(nextState);
  setStats(nextState);
  setLog(nextState);
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function poll() {
  const response = await sw('GET_STATE');
  render(response?.state || null);
}

async function openDashboard() {
  const tabs = DASHBOARD_URL_PATTERNS.length > 0
    ? await chrome.tabs.query({ url: DASHBOARD_URL_PATTERNS })
    : [];
  if (tabs.length > 0 && Number.isInteger(tabs[0].id)) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (Number.isInteger(tab.windowId)) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: DEFAULT_DASHBOARD_URL, active: true });
}

getEl('openDashboardBtn').addEventListener('click', openDashboard);
getEl('refreshBtn').addEventListener('click', poll);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    render(message.state || null);
  }
});

poll();
setInterval(poll, 1500);
