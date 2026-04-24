// ── Meta Bulk Pay Now — Background Service Worker ─────────────────────────────

importScripts('../shared/dashboard-config.js');

const STATE_KEY = 'bulk_paynow_state';
const DASHBOARD_STATE_KEY = 'meta_paynow_extension_state';
const DASHBOARD_EVENT_NAME = 'meta-paynow-extension-state';
const DASHBOARD_URL_PATTERNS = globalThis.DashboardConfig?.getDashboardUrlPatterns?.() || [];
const SETTINGS_KEY = 'extension_settings';
const RUNNER_DEFAULT_SETTINGS = Object.freeze({
  batchSize: 10,
  tabDelay: 500,
  batchPause: 1000,
});

let dashboardPushTimer = null;
let dashboardPendingState = null;

function sanitizeSettings(raw = {}) {
  return {
    batchSize: Math.min(
      200,
      Math.max(
        1,
        Number.parseInt(raw.batchSize, 10) || RUNNER_DEFAULT_SETTINGS.batchSize,
      ),
    ),
    tabDelay: Math.min(
      15000,
      Math.max(
        500,
        Number.parseInt(raw.tabDelay, 10) || RUNNER_DEFAULT_SETTINGS.tabDelay,
      ),
    ),
    batchPause: Math.min(
      180000,
      Math.max(
        1000,
        Number.parseInt(raw.batchPause, 10) || RUNNER_DEFAULT_SETTINGS.batchPause,
      ),
    ),
  };
}

// Function to get current settings
async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const storedSettings = data[SETTINGS_KEY];

  if (!storedSettings) {
    const defaults = sanitizeSettings(RUNNER_DEFAULT_SETTINGS);
    await chrome.storage.local.set({ [SETTINGS_KEY]: defaults });
    return defaults;
  }

  const sanitized = sanitizeSettings(storedSettings);

  if (
    sanitized.batchSize !== storedSettings.batchSize ||
    sanitized.tabDelay !== storedSettings.tabDelay ||
    sanitized.batchPause !== storedSettings.batchPause
  ) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: sanitized });
  }

  return sanitized;
}

// ── State helpers ──────────────────────────────────────────────────────────────

async function getState() {
  const r = await chrome.storage.local.get(STATE_KEY);
  return r[STATE_KEY] || null;
}

async function patchState(patch) {
  const s = await getState();
  const next = { ...s, ...patch };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  broadcast({ type: 'STATE_UPDATE', state: next });
  return next;
}

async function updateAccount(id, patch) {
  const s = await getState();
  if (!s) return;
  const accounts = s.accounts.map(a => a.id === id ? { ...a, ...patch } : a);
  const stats = computeStats(accounts);
  await patchState({ accounts, stats });
}

function computeStats(accounts) {
  return {
    total: accounts.length,
    pending: accounts.filter(a => a.result === 'pending').length,
    running: accounts.filter(a => a.result === 'running').length,
    success: accounts.filter(a => a.result === 'success' || a.result === 'success_uncertain').length,
    failed: accounts.filter(a => ['error', 'payment_error', 'no_button'].includes(a.result)).length,
    skipped: accounts.filter(a => a.result === 'skipped').length,
  };
}

async function pushStateToDashboard(state) {
  if (DASHBOARD_URL_PATTERNS.length === 0) return;

  const payload = {
    source: 'meta_bulk_paynow_extension',
    updatedAt: Date.now(),
    running: !!state?.running,
    startedAt: state?.startedAt || null,
    finishedAt: state?.finishedAt || null,
    stats: state?.stats || null,
    log: state?.log || [],
    accounts: Array.isArray(state?.accounts)
      ? state.accounts.map(account => ({
        id: account.id,
        result: account.result,
        detail: account.detail || '',
        completedAt: account.completedAt || null,
      }))
      : [],
    accountCount: state?.accounts?.length || 0,
  };

  const tabs = await chrome.tabs.query({ url: DASHBOARD_URL_PATTERNS });
  if (!tabs || tabs.length === 0) return;

  const injections = tabs
    .filter(tab => Number.isInteger(tab.id))
    .map(tab => chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [DASHBOARD_STATE_KEY, DASHBOARD_EVENT_NAME, payload],
      func: (storageKey, eventName, nextPayload) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(nextPayload));
          window.dispatchEvent(new CustomEvent(eventName, { detail: nextPayload }));
        } catch (_) {
          // Ignore storage access errors in restricted pages.
        }
      }
    }));

  await Promise.allSettled(injections);
}

function scheduleDashboardPush(state) {
  dashboardPendingState = state || null;
  if (dashboardPushTimer) return;

  dashboardPushTimer = setTimeout(async () => {
    const nextState = dashboardPendingState;
    dashboardPendingState = null;
    dashboardPushTimer = null;
    try {
      await pushStateToDashboard(nextState);
    } catch (_) {
      // Ignore sync errors so automation flow is never blocked.
    }
  }, 250);
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => { });
  if (msg?.type === 'STATE_UPDATE') {
    scheduleDashboardPush(msg.state);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Tab registry ───────────────────────────────────────────────────────────────
// Maps tabId → accountId so we know which account a tab belongs to

const tabRegistry = new Map(); // tabId → { accountId, status }

async function closeRunnerTabs(reason = 'Stopped by user') {
  const entries = Array.from(tabRegistry.entries());
  if (entries.length === 0) {
    await addLog(`🧹 ${reason} — no open tabs to close`);
    return;
  }

  const affectedAccountIds = new Set(entries.map(([, entry]) => entry.accountId));
  const state = await getState();
  const accountNameById = new Map(
    (state?.accounts || []).map(account => [account.id, account.name || account.id])
  );
  const closedNamesPreview = entries
    .slice(0, 5)
    .map(([, entry]) => accountNameById.get(entry.accountId) || entry.accountId);
  const extraCount = entries.length - closedNamesPreview.length;
  const previewSuffix = extraCount > 0 ? `, +${extraCount} more` : '';

  await addLog(
    `🧹 ${reason} — closing ${entries.length} tab(s): ${closedNamesPreview.join(', ')}${previewSuffix}`
  );

  if (state?.accounts?.length) {
    const completedAt = Date.now();
    const accounts = state.accounts.map(account => {
      if (!affectedAccountIds.has(account.id)) return account;
      if (account.result !== 'running') return account;
      return {
        ...account,
        result: 'error',
        detail: reason,
        completedAt,
      };
    });

    await patchState({ accounts, stats: computeStats(accounts) });
  }

  for (const [tabId] of entries) {
    if (tabRegistry._resolve) tabRegistry._resolve(tabId);
    tabRegistry.delete(tabId);
  }

  await Promise.allSettled(
    entries.map(([tabId]) => chrome.tabs.remove(tabId))
  );
}

// ── Core automation ────────────────────────────────────────────────────────────

let automationRunning = false;
let stopRequested = false;

async function runAutomation() {
  automationRunning = true;
  stopRequested = false;
  try {
    const state = await getState();
    if (!state) return;

    const pending = state.accounts.filter(a => a.result === 'pending');
    addLog(`Starting automation — ${pending.length} accounts to process`);

    const settings = await getSettings();
    const BATCH_SIZE = settings.batchSize;
    const TAB_DELAY = settings.tabDelay;
    const BATCH_PAUSE = settings.batchPause;

    // Process in batches
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (stopRequested) {
        addLog('⛔ Stopped by user');
        break;
      }
      if (stopRequested) break;

      const batch = pending.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
      addLog(`── Batch ${batchNum}/${totalBatches}: opening ${batch.length} tabs`);

      // Open tabs for this batch with staggered delay
      const batchTabIds = [];
      for (const account of batch) {
        if (stopRequested) break;
        await updateAccount(account.id, { result: 'running', detail: 'Opening tab…' });

        const tab = await chrome.tabs.create({ url: account.url, active: false });
        tabRegistry.set(tab.id, { accountId: account.id, tabOpened: Date.now() });
        batchTabIds.push(tab.id);
        addLog(`  ↗ Opened: ${account.name}`);

        await sleep(TAB_DELAY);
      }

      // Wait for all tabs in this batch to complete (or timeout)
      addLog(`  ⏳ Waiting for batch ${batchNum} to complete…`);
      await waitForBatch(batchTabIds, 60000); // 60s max per batch

      // Close any tabs that are still open (timed out)
      for (const tabId of batchTabIds) {
        try { await chrome.tabs.remove(tabId); } catch (_) { }
        tabRegistry.delete(tabId);
      }

      // If more batches remain, pause between batches
      const remaining = pending.slice(i + BATCH_SIZE);
      if (remaining.length > 0 && !stopRequested) {
        addLog(`  ⏸ Pausing ${BATCH_PAUSE / 1000}s before next batch…`);
        await sleep(BATCH_PAUSE);
      }
    }

    const finalState = await getState();
    if (!finalState) return;

    const finalStats = finalState.stats || computeStats(finalState.accounts || []);
    await patchState({
      running: false,
      finishedAt: Date.now(),
      stats: finalStats,
    });
    addLog(
      `🏁 Done — ✅ ${finalStats.success} paid · ❌ ${finalStats.failed} failed · ⏭ ${finalStats.skipped} skipped`
    );
  } finally {
    automationRunning = false;
  }
}

function waitForBatch(tabIds, timeout) {
  return new Promise(resolve => {
    const started = Date.now();
    const pending = new Set(tabIds);

    function check() {
      if (pending.size === 0 || Date.now() - started > timeout) {
        resolve();
        return;
      }
      setTimeout(check, 300);
    }

    // Mark a tab as done when it's removed from pending
    tabRegistry._resolve = (tabId) => {
      pending.delete(tabId);
    };

    check();
  });
}

// ── Tab status handler ─────────────────────────────────────────────────────────
// Called when content script sends TAB_STATUS or CONTENT_READY

async function handleTabStatus(tabId, msg) {
  const entry = tabRegistry.get(tabId);
  if (!entry) return;

  const { accountId } = entry;

  switch (msg.type) {

    case 'CONTENT_READY':
      // Content script loaded — send the START signal
      await sleep(500); // brief pause for React hydration
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'START_PAYNOW' });
      } catch (e) {
        // Tab may have navigated, retry once
        await sleep(1000);
        try { await chrome.tabs.sendMessage(tabId, { type: 'START_PAYNOW' }); } catch (_) { }
      }
      break;

    case 'TAB_STATUS': {
      const status = msg.status;
      const detail = msg.detail || '';

      // Map content script status → account result
      const terminalStatuses = ['success', 'success_uncertain', 'error', 'payment_error', 'no_button'];

      if (status === 'success' || status === 'success_uncertain') {
        await updateAccount(accountId, {
          result: status,
          detail: status === 'success' ? '✅ Payment submitted' : '⚠️ Likely paid (modal closed)',
          completedAt: Date.now(),
        });
        addLog(`  ✅ ${await getAccountName(accountId)}: Paid`);
        // Close tab
        try { await chrome.tabs.remove(tabId); } catch (_) { }
        if (tabRegistry._resolve) tabRegistry._resolve(tabId);
        tabRegistry.delete(tabId);

      } else if (status === 'payment_error' || status === 'error') {
        await updateAccount(accountId, {
          result: status,
          detail: detail || '❌ Failed',
          completedAt: Date.now(),
        });
        addLog(`  ❌ ${await getAccountName(accountId)}: ${detail || 'Error'}`);
        try { await chrome.tabs.remove(tabId); } catch (_) { }
        if (tabRegistry._resolve) tabRegistry._resolve(tabId);
        tabRegistry.delete(tabId);

      } else {
        // Intermediate status — just update detail
        await updateAccount(accountId, { detail: statusLabel(status) });
      }
      break;
    }
  }
}

function statusLabel(s) {
  const map = {
    started: '🔄 Started',
    waiting_page_btn: '⏳ Waiting for Pay Now button…',
    clicked_page_btn: '🖱 Clicked Pay Now',
    waiting_modal: '⏳ Waiting for modal…',
    modal_open: '📋 Modal opened',
    waiting_modal_btn: '⏳ Finding confirm button…',
    clicked_confirm: '🖱 Clicked confirm',
    waiting_result: '⏳ Awaiting result…',
  };
  return map[s] || s;
}

async function getAccountName(accountId) {
  const state = await getState();
  return state?.accounts?.find(a => a.id === accountId)?.name || accountId;
}

// ── Log helper ─────────────────────────────────────────────────────────────────

async function addLog(msg) {
  const state = await getState();
  if (!state) return;
  const log = [...(state.log || []).slice(-299), { ts: Date.now(), msg }];
  await patchState({ log });
}

// ── Handle tab removal (user closed manually or crash) ─────────────────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const entry = tabRegistry.get(tabId);
  if (!entry) return;

  const { accountId } = entry;
  const state = await getState();
  const account = state?.accounts?.find(a => a.id === accountId);

  // If still running when tab was removed, mark as uncertain
  if (account?.result === 'running') {
    await updateAccount(accountId, {
      result: 'error',
      detail: 'Tab closed before completion',
      completedAt: Date.now(),
    });
    addLog(`  ⚠️ Tab closed: ${account.name}`);
  }

  if (tabRegistry._resolve) tabRegistry._resolve(tabId);
  tabRegistry.delete(tabId);
});

// ── Message handler ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  (async () => {
    // Messages from content scripts
    if (msg.type === 'CONTENT_READY' || msg.type === 'TAB_STATUS') {
      if (tabId) await handleTabStatus(tabId, msg);
      sendResponse({ ok: true });
      return;
    }

    // Messages from popup
    switch (msg.type) {

      case 'GET_STATE': {
        const state = await getState();
        sendResponse({ state });
        break;
      }

      case 'GET_SETTINGS': {
        const settings = await getSettings();
        sendResponse({ ok: true, settings });
        break;
      }

      case 'SET_SETTINGS': {
        const settings = sanitizeSettings(msg.settings || {});
        await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
        sendResponse({ ok: true, settings });
        break;
      }

      case 'LOAD_ACCOUNTS': {
        // Accepts accounts array from the popup (pasted JSON or from localStorage)
        const accounts = (msg.accounts || []).map(a => ({
          id: a.id,
          name: a.name || a.id,
          url: a.url,
          status: a.status,
          bmId: a.bmId,
          result: 'pending',
          detail: '',
          completedAt: null,
        }));

        await chrome.storage.local.set({
          [STATE_KEY]: {
            accounts,
            stats: computeStats(accounts),
            running: false,
            log: [{ ts: Date.now(), msg: `📥 Loaded ${accounts.length} accounts` }],
            loadedAt: Date.now(),
            finishedAt: null,
          }
        });

        const state = await getState();
        broadcast({ type: 'STATE_UPDATE', state });
        sendResponse({ ok: true, count: accounts.length });
        break;
      }

      case 'START': {
        if (automationRunning) { sendResponse({ ok: false, error: 'Already running' }); return; }
        const state = await getState();
        if (!state || state.accounts.filter(a => a.result === 'pending').length === 0) {
          sendResponse({ ok: false, error: 'No pending accounts' });
          return;
        }
        stopRequested = false;
        await patchState({ running: true, startedAt: Date.now() });
        runAutomation(); // fire and forget
        sendResponse({ ok: true });
        break;
      }

      case 'STOP': {
        stopRequested = true;
        await closeRunnerTabs('Stopped by user');
        await patchState({ running: false });
        addLog('⛔ Stopped by user');
        sendResponse({ ok: true });
        break;
      }

      case 'RESET': {
        stopRequested = true;
        await closeRunnerTabs('Queue reset by user');
        if (msg.clearAll === false) {
          const state = await getState();
          const nextState = {
            accounts: [],
            stats: computeStats([]),
            running: false,
            log: [
              ...((state?.log || []).slice(-299)),
              { ts: Date.now(), msg: '🧽 Queue reset by user' },
            ],
            loadedAt: state?.loadedAt || Date.now(),
            startedAt: null,
            finishedAt: null,
          };
          await chrome.storage.local.set({ [STATE_KEY]: nextState });
          broadcast({ type: 'STATE_UPDATE', state: nextState });
        } else {
          await chrome.storage.local.remove(STATE_KEY);
          broadcast({ type: 'STATE_UPDATE', state: null });
        }
        sendResponse({ ok: true });
        break;
      }

      case 'RETRY_FAILED': {
        const state = await getState();
        if (!state) { sendResponse({ ok: false }); return; }
        const accounts = state.accounts.map(a =>
          ['error', 'payment_error', 'no_button'].includes(a.result)
            ? { ...a, result: 'pending', detail: '' }
            : a
        );
        await patchState({ accounts, stats: computeStats(accounts), running: false });
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message' });
    }
  })();

  return true;
});
