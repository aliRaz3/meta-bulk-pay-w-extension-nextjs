"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AddUserToAdAccountsModal, { useAddUserToAdAccounts } from "@/components/addUserToAdAccount";
import Script from "next/script";

// ── Constants ────────────────────────────────────────────────────────────────
const GRAPH_VERSION = "v25.0";
const LS_KEY = "meta_paynow_accounts";
const LS_STATE_KEY = "meta_paynow_all_accounts";
const LS_SESSION_KEY = "meta_paynow_session_id";
const LS_EXTENSION_STATE_KEY = "meta_paynow_extension_state";
const LS_USER_KEY = "meta_paynow_user";
const EXTENSION_STATE_EVENT = "meta-paynow-extension-state";
const EXTENSION_COMMAND_EVENT = "meta-paynow-extension-command";
const EXTENSION_RESPONSE_EVENT = "meta-paynow-extension-response";
const EXTENSION_BRIDGE_PING_EVENT = "meta-paynow-extension-ping";
const EXTENSION_BRIDGE_READY_EVENT = "meta-paynow-extension-ready";

const STATUS_META = {
  1: { label: "Active", color: "#22c55e", bg: "#22c55e18", selectable: false },
  2: { label: "Disabled", color: "#ef4444", bg: "#ef444418", selectable: true },
  3: { label: "Unsettled", color: "#f97316", bg: "#f9731618", selectable: true },
  7: { label: "Risk Review", color: "#a855f7", bg: "#a855f718", selectable: true },
  9: { label: "Grace Period", color: "#eab308", bg: "#eab30818", selectable: true },
  101: { label: "Closed", color: "#6b7280", bg: "#6b728018", selectable: false },
};

const SELECTABLE_STATUSES = Object.entries(STATUS_META)
  .filter(([, v]) => v.selectable)
  .map(([k, v]) => ({ code: Number(k), ...v }));

function readExtensionLiveState() {
  try {
    const raw = localStorage.getItem(LS_EXTENSION_STATE_KEY);
    return raw ? normalizeExtensionState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function normalizeExtensionState(state) {
  if (!state) return null;
  return {
    source: "meta_bulk_paynow_extension",
    updatedAt: state.updatedAt || Date.now(),
    running: !!state.running,
    startedAt: state.startedAt || null,
    finishedAt: state.finishedAt || null,
    stats: state.stats || null,
    logs: Array.isArray(state.log)
      ? state.log
      : Array.isArray(state.logs)
        ? state.logs
        : [],
    accounts: Array.isArray(state.accounts)
      ? state.accounts.map((account) => ({
          id: account.id,
          result: account.result,
          detail: account.detail || "",
          completedAt: account.completedAt || null,
        }))
      : [],
    accountCount:
      Number.isFinite(state.accountCount) && state.accountCount >= 0
        ? state.accountCount
        : state.accounts?.length || 0,
  };
}

function billingUrl(adAccountId, businessId) {
  const clean = adAccountId.replace("act_", "");
  return `https://business.facebook.com/latest/billing_hub/accounts/details/?payment_account_id=${clean}&business_id=${businessId}&asset_id=${clean}`;
}

function isPaidAccount(account) {
  return !!account?.paidVerified || account?.result === "processed";
}

// ── Styles ───────────────────────────────────────────────────────────────────
const G = {
  bg: "#f0f2f5",
  surface: "#ffffff",
  surface2: "#f5f6f7",
  surface3: "#e4e6eb",
  border: "#ccd0d5",
  border2: "#bec3c9",
  accent: "#1877f2",
  accentDim: "#1877f215",
  text: "#1c1e21",
  text2: "#606770",
  text3: "#8d949e",
  success: "#42b72a",
  warn: "#f0ad4e",
  error: "#fa383e",
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: ${G.bg};
    color: ${G.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    min-height: 100vh;
    overflow-x: hidden;
  }
  ::selection { background: ${G.accent}40; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${G.border2}; border-radius: 3px; }

  #root { position: relative; z-index: 1; }

  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .header {
    border-bottom: 1px solid ${G.border};
    background: #ffffff;
    position: sticky; top: 0; z-index: 100;
  }
  .header-inner {
    display: flex; align-items: center; gap: 16px;
    padding: 14px 0;
  }
  .header-logo {
    display: flex; align-items: center; gap: 10px;
  }
  .header-icon {
    width: 36px; height: 36px;
    background: ${G.accent};
    border-radius: 6px;
    display: grid; place-items: center;
    font-size: 18px; color: #fff;
    flex-shrink: 0;
  }
  .header-title {
    font-family: inherit;
    font-size: 16px; font-weight: 800;
    letter-spacing: -.3px;
  }
  .header-sub { font-size: 11px; color: ${G.text2}; margin-top: 1px; }
  .header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .user-chip {
    display: flex; align-items: center; gap: 8px;
    background: ${G.surface2};
    border: 1px solid ${G.border};
    border-radius: 20px;
    padding: 5px 12px 5px 5px;
    font-size: 12px;
  }
  .user-avatar {
    width: 24px; height: 24px; border-radius: 50%;
    background: ${G.accent};
    display: grid; place-items: center;
    font-size: 10px; font-weight: 700; color: #fff;
  }

  .hero {
    text-align: center;
    padding: 40px 0 30px;
  }
  .hero-sub {
    font-size: 15px; color: ${G.text2};
    max-width: 480px; margin: 0 auto 36px;
    line-height: 1.6;
  }

  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 16px;
    border-radius: 6px; border: none;
    font-family: inherit;
    font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all .15s;
    white-space: nowrap;
    text-decoration: none;
  }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn-primary { background: ${G.accent}; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #166fe5; }
  .btn-fb { background: #1877f2; color: #fff; font-size: 14px; padding: 8px 24px; border-radius: 6px; }
  .btn-fb:hover:not(:disabled) { background: #166fe5; }
  .btn-ghost { background: #ffffff; border: 1px solid ${G.border}; color: #1c1e21; }
  .btn-ghost:hover:not(:disabled) { background: #f0f2f5; }
  .btn-danger { background: #ffffff; border: 1px solid ${G.border}; color: ${G.error}; }
  .btn-danger:hover:not(:disabled) { background: #f0f2f5; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .btn-xs { padding: 4px 9px; font-size: 11px; border-radius: 6px; }

  .card {
    background: #ffffff;
    border: 1px solid ${G.border};
    border-radius: 8px;
    padding: 20px;
  }
  .card-title {
    font-family: inherit;
    font-size: 14px; font-weight: 700;
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }

  .steps {
    display: flex; gap: 0;
    margin-bottom: 40px;
  }
  .step {
    flex: 1;
    display: flex; flex-direction: column; align-items: center;
    position: relative;
  }
  .step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 16px; left: calc(50% + 16px);
    right: calc(-50% + 16px);
    height: 1px;
    background: ${G.border};
  }
  .step.done:not(:last-child)::after { background: ${G.accent}60; }
  .step-dot {
    width: 32px; height: 32px; border-radius: 50%;
    display: grid; place-items: center;
    font-family: ui-monospace, monospace;
    font-size: 12px; font-weight: 500;
    border: 1px solid ${G.border};
    background: #ffffff;
    color: ${G.text3};
    margin-bottom: 8px;
    position: relative; z-index: 1;
    transition: all .2s;
  }
  .step.done .step-dot { background: ${G.accentDim}; border-color: ${G.accent}60; color: ${G.accent}; }
  .step.active .step-dot { background: ${G.accent}; border-color: ${G.accent}; color: #fff; }
  .step-label { font-size: 11px; color: ${G.text3}; text-align: center; }
  .step.done .step-label, .step.active .step-label { color: ${G.text2}; }

  .progress-row {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 0;
  }
  .progress-bar {
    flex: 1; height: 4px;
    background: ${G.surface3};
    border-radius: 2px; overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: ${G.accent};
    border-radius: 2px;
    transition: width .4s ease;
  }
  .progress-label { font-size: 11px; color: ${G.text2}; font-family: ui-monospace, monospace; white-space: nowrap; }

  .stats-panel {
    border: 1px solid ${G.border};
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 20px;
    background: #ffffff;
  }
  .stats-strip { display: flex; gap: 1px; background: ${G.border}; }
  .stats-progress { padding: 10px 16px; border-top: 1px solid ${G.border}; background: #ffffff; }
  .stat-block { flex: 1; background: #ffffff; padding: 12px 16px; text-align: center; }
  .stat-val { font-family: inherit; font-size: 22px; font-weight: 800; line-height: 1; }
  .stat-lbl { font-size: 10px; color: ${G.text2}; margin-top: 3px; text-transform: uppercase; letter-spacing: .06em; }

  .table-wrap { background: #ffffff; border: 1px solid ${G.border}; border-radius: 8px; overflow: hidden; }
  .table-tools {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    background: #ffffff;
    border-bottom: 1px solid ${G.border};
    flex-wrap: wrap;
  }
  .table-tools-spacer { flex: 1; min-width: 0; }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 140px 110px 80px 100px;
    gap: 12px;
    padding: 10px 16px;
    background: #f5f6f7;
    border-bottom: 1px solid ${G.border};
    font-size: 10px; font-weight: 700;
    color: ${G.text3};
    text-transform: uppercase; letter-spacing: .07em;
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 140px 110px 80px 100px;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid ${G.border};
    align-items: center;
    font-size: 13px;
    transition: background .1s;
  }
  .table-row:last-child { border-bottom: none; }
  .table-row:hover { background: #f5f6f7; }
  .table-row.processed { opacity: .55; }
  .acct-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acct-id { font-family: ui-monospace, monospace; font-size: 10px; color: ${G.text2}; margin-top: 1px; }
  .acct-bm { font-size: 10px; color: ${G.text3}; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
    font-family: ui-monospace, monospace;
    white-space: nowrap;
  }
  .pill-dot { width: 5px; height: 5px; border-radius: 50%; }

  .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .search-input {
    flex: 1; min-width: 200px;
    background: ${G.surface2};
    border: 1px solid ${G.border};
    border-radius: 8px;
    color: ${G.text};
    padding: 8px 12px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    transition: border-color .15s;
  }
  .search-input:focus { border-color: ${G.accent}; }
  .search-input::placeholder { color: ${G.text3}; }

  .app-id-input {
    width: 100%;
    background: #ffffff;
    border: 1px solid ${G.border};
    border-radius: 6px;
    color: ${G.text};
    padding: 10px 14px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    outline: none;
    transition: border-color .15s;
  }
  .app-id-input:focus { border-color: ${G.accent}; }
  .app-id-input::placeholder { color: ${G.text3}; }
  .input-label { display: block; font-size: 11px; font-weight: 600; color: ${G.text2}; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
  .input-hint { font-size: 11px; color: ${G.text3}; margin-top: 5px; line-height: 1.5; }

  .toast-wrap { position: fixed; top: 80px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 9999; }
  .toast {
    display: flex; align-items: center; gap: 10px;
    background: ${G.surface2};
    border: 1px solid ${G.border};
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    box-shadow: 0 8px 32px #00000060;
    animation: slideIn .2s ease;
    max-width: 320px;
  }
  @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
  .toast.success { border-color: ${G.success}40; }
  .toast.error   { border-color: ${G.error}40; }
  .toast.info    { border-color: ${G.accent}40; }

  .modal-overlay {
    position: fixed; inset: 0;
    background: #00000080;
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
    animation: fadeIn .15s ease;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .modal {
    background: #ffffff;
    border: 1px solid ${G.border};
    border-radius: 8px;
    padding: 24px;
    width: 540px; max-width: 90vw;
    max-height: 80vh; overflow-y: auto;
  }
  .modal-title { font-family: inherit; font-size: 16px; font-weight: 700; margin-bottom: 16px; }
  .code-block {
    background: #f5f6f7;
    border: 1px solid ${G.border};
    border-radius: 6px;
    padding: 12px;
    font-family: ui-monospace, monospace;
    font-size: 11px; color: ${G.text2};
    white-space: pre-wrap; word-break: break-all;
    max-height: 300px; overflow-y: auto;
    line-height: 1.6;
    margin-bottom: 14px;
  }

  .fetch-status {
    background: #ffffff;
    border: 1px solid ${G.border};
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .fetch-bm-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
  .fetch-bm-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: ${G.text2}; }
  .spinner {
    width: 14px; height: 14px;
    border: 2px solid ${G.border};
    border-top-color: ${G.accent};
    border-radius: 50%;
    animation: spin .6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg) } }

  .empty { text-align: center; padding: 60px 20px; color: ${G.text3}; }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }

  .select-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid ${G.border};
    background: #ffffff;
    font-size: 12px; color: ${G.text2};
    flex-wrap: wrap;
  }
  input[type=checkbox] { width: 14px; height: 14px; accent-color: ${G.accent}; cursor: pointer; }

  @media (max-width: 700px) {
    .table-header, .table-row { grid-template-columns: 1fr 90px 80px; }
    .table-header > *:nth-child(4), .table-header > *:nth-child(5),
    .table-row > *:nth-child(4), .table-row > *:nth-child(5) { display: none; }
    .steps { gap: 4px; }
  }
`;

// ── Toast system ─────────────────────────────────────────────────────────────
let toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: `Status ${status}`, color: G.text3, bg: G.surface3 };
  return (
    <span className="pill" style={{ background: m.bg, color: m.color }}>
      <span className="pill-dot" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function ResultPill({ result }) {
  const map = {
    pending: { label: "—", color: G.text3, bg: G.surface3 },
    processed: { label: "✓ Paid", color: G.success, bg: G.success + "18" },
    opened: { label: "↗ Opened", color: G.accent, bg: G.accent + "18" },
    failed: { label: "✗ Failed", color: G.error, bg: G.error + "18" },
  };
  const m = map[result] || map.pending;
  return <span className="pill" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { toasts, add: toast } = useToasts();

  const [appId, setAppId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("meta_app_id") || "";
    return "";
  });
  const [appIdSaved, setAppIdSaved] = useState(() => {
    if (typeof window !== "undefined") return !!localStorage.getItem("meta_app_id");
    return false;
  });

  const [fbReady, setFbReady] = useState(false);
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem(LS_USER_KEY) || "null"); } catch { return null; }
    }
    return null;
  });
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(LS_SESSION_KEY) || null;
    return null;
  });

  const [selectedStatuses, setSelectedStatuses] = useState([3]);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBMs, setSelectedBMs] = useState(new Set());
  const [bmsFetched, setBmsFetched] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchLog, setFetchLog] = useState([]);

  const [accounts, setAccounts] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stateAccts = localStorage.getItem(LS_STATE_KEY);
        if (stateAccts) return JSON.parse(stateAccts);
        return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      } catch { return []; }
    }
    return [];
  });

  const [search, setSearch] = useState("");
  const [unselected, setUnselected] = useState(new Set());
  const [extensionLiveState, setExtensionLiveState] = useState(null);
  const [extensionBridgeReady, setExtensionBridgeReady] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [runnerSettings, setRunnerSettings] = useState({ batchSize: 10, tabDelaySec: 0.5, batchPauseSec: 1 });
  const [runnerPanelTab, setRunnerPanelTab] = useState("actions");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [filterHasBalance, setFilterHasBalance] = useState(true);
  const [userActivityEpoch, setUserActivityEpoch] = useState(0);
  const verifiedBalanceRequestRef = useRef(new Set());
  const markUserActivity = useCallback(() => setUserActivityEpoch((e) => e + 1), []);

  // ── Init: read extension state on client ──────────────────────────────────
  useEffect(() => {
    setExtensionLiveState(readExtensionLiveState());
  }, []);

  // ── Save App ID ─────────────────────────────────────────────────────────
  function saveAppId() {
    const id = appId.trim();
    if (!id) { toast("Enter a valid App ID", "error"); return; }
    localStorage.setItem("meta_app_id", id);
    setAppIdSaved(true);
    toast("App ID saved", "success");
  }

  // ── Load FB SDK ─────────────────────────────────────────────────────────
  function handleFbSdkLoad() {
    const savedId = localStorage.getItem("meta_app_id");
    if (!savedId) return;
    window.FB.init({ appId: savedId, cookie: true, xfbml: false, version: GRAPH_VERSION });
    setFbReady(true);
    window.FB.getLoginStatus((r) => {
      if (r.status === "connected") {
        const t = r.authResponse.accessToken;
        fetchUserInfo(t);
      }
    });
  }

  useEffect(() => {
    if (!appIdSaved) return;
    if (window.FB) { handleFbSdkLoad(); }
    // SDK loaded via Script tag with onLoad={handleFbSdkLoad}
  }, [appIdSaved]);

  // ── Load DB accounts on refresh if sessionId already in localStorage ────────
  // useEffect(() => {
  //   if (sessionId && accounts.length === 0) {
  //     loadAccountsFromDB(sessionId);
  //   }
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // ── Server-side user info ───────────────────────────────────────────────
  async function fetchUserInfo(token) {
    try {
      const res = await fetch("/api/meta/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(data.user));
        // Upsert session in DB (one record per userId+appId), get back sessionId
        const sessRes = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id, userName: data.user.name, token, appId: localStorage.getItem("meta_app_id") || "" }),
        });
        const sessData = await sessRes.json();
        if (sessData.session?.id) {
          setSessionId(sessData.session.id);
          localStorage.setItem(LS_SESSION_KEY, sessData.session.id);
        }
      }
    } catch (e) { console.error(e); }
  }

  async function loadAccountsFromDB(sid) {
    try {
      const res = await fetch(`/api/meta/accounts?sessionId=${sid}`);
      const data = await res.json();
      if (data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts);
        localStorage.setItem(LS_STATE_KEY, JSON.stringify(data.accounts));
        toast(`Loaded ${data.accounts.length} accounts from database`, "info");
      }
    } catch (e) { console.error(e); }
  }

  // ── Facebook Login ──────────────────────────────────────────────────────
  function handleLogin() {
    if (!window.FB) { toast("Facebook SDK not ready", "error"); return; }
    window.FB.login(
      (r) => {
        if (r.authResponse) {
          const t = r.authResponse.accessToken;
          setToken(t);
          fetchUserInfo(t);
          toast("Connected to Facebook", "success");
        } else {
          toast("Login cancelled", "error");
        }
      },
      { scope: "ads_read,business_management,ads_management", return_scopes: true }
    );
  }

  function handleLogout() {
    if (window.FB) window.FB.logout(() => {});
    void clearRunnerStatsAndLogs();
    setUser(null); setSessionId(null);
    localStorage.removeItem(LS_EXTENSION_STATE_KEY);
    localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(LS_SESSION_KEY);
    setAccounts([]); localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_STATE_KEY);
    setFetchLog([]);
    setBusinesses([]); setSelectedBMs(new Set()); setBmsFetched(false);
    setExtensionLiveState(null);
    toast("Logged out", "info");
  }

  function handleResetApp() {
    const confirmed = window.confirm("Reset the app and clear saved App ID, Session, and cached accounts?");
    if (!confirmed) return;
    if (window.FB) window.FB.logout(() => {});
    void clearRunnerStatsAndLogs();
    localStorage.removeItem("meta_app_id");
    localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_STATE_KEY);
    localStorage.removeItem(LS_EXTENSION_STATE_KEY); localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(LS_SESSION_KEY);
    setAppId(""); setAppIdSaved(false); setFbReady(false); setUser(null); setSessionId(null);
    setSelectedStatuses([3]); setBusinesses([]); setSelectedBMs(new Set()); setBmsFetched(false);
    setFetching(false); setFetchLog([]); setAccounts([]);
    setSearch(""); setUnselected(new Set()); setExtensionLiveState(null); setFilterHasBalance(true);
    resetAddUserState();
    toast("App reset complete", "success");
  }

  // ── Fetch BMs (server-side) ─────────────────────────────────────────────
  async function fetchBMs() {
    if (!sessionId) { toast("Session not ready — please wait", "error"); return; }
    setFetching(true);
    try {
      const res = await fetch("/api/meta/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const bms = data.businesses;
      if (bms.length === 0) {
        toast("No Business Managers found for this account", "error");
      } else {
        setBusinesses(bms);
        setSelectedBMs(new Set(bms.map((b) => b.id)));
        setBmsFetched(true);
        toast(`Found ${bms.length} Business Managers`, "success");
      }
    } catch (e) {
      toast(`Error: ${e.message}`, "error");
    }
    setFetching(false);
  }

  // ── Fetch Ad Accounts (server-side) ─────────────────────────────────────
  async function fetchAdAccounts() {
    if (!sessionId) { toast("Session not ready — please wait", "error"); return; }
    if (selectedBMs.size === 0) { toast("Select at least one BM", "error"); return; }

    setFetching(true); setFetchLog([]); setAccounts([]);

    const bmsToProcess = businesses.filter((b) => selectedBMs.has(b.id));
    setFetchLog(bmsToProcess.map((bm) => ({ bmId: bm.id, bmName: bm.name, status: "loading", count: 0 })));

    try {
      const res = await fetch("/api/meta/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, bmIds: [...selectedBMs], businesses }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setFetchLog(data.fetchResults);
      setAccounts(data.accounts);
      try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(data.accounts)); } catch { }
      toast(`Found ${data.accounts.length} accounts`, "success");
    } catch (e) {
      toast(`Error: ${e.message}`, "error");
    }
    setFetching(false);
  }

  // ── Persist accounts to localStorage on change ────────────────────────
  useEffect(() => {
    if (accounts.length > 0) {
      try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(accounts)); } catch { }
    }
  }, [accounts]);

  // ── Open account in new tab ────────────────────────────────────────────
  function openAccount(acc) {
    window.open(acc.url, "_blank");
    const updated = { ...acc, result: "opened" };
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? updated : a)));
    if (sessionId) {
      fetch("/api/meta/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acc.id, result: "opened" }),
      });
    }
  }

  // ── Filter/Search ─────────────────────────────────────────────────────
  const matchesSearchAndStatus = (a) => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.name.toLowerCase().includes(q) || a.id.includes(q) || a.bmName.toLowerCase().includes(q);
    const matchStatus = filterHasBalance || selectedStatuses.includes("all") || selectedStatuses.includes(a.status);
    return matchSearch && matchStatus;
  };

  const filtered = accounts.filter((a) => {
    const balanceValue = Number(a.balance ?? 0);
    const statusCode = Number(a.status);
    const recentlyPaidVisible = !!a.paidVerificationPending || (!!a.paidVerified && a.payableVisibilityEpoch === userActivityEpoch);
    const matchHasBalance = !filterHasBalance || (Number.isFinite(balanceValue) && balanceValue > 0 && statusCode !== 2) || recentlyPaidVisible;
    return matchesSearchAndStatus(a) && matchHasBalance;
  });

  const selectableVisibleAccounts = filtered.filter((a) => !isPaidAccount(a));
  const effectivelySelected = selectableVisibleAccounts.filter((a) => !unselected.has(a.id));
  const allVisibleSelected = selectableVisibleAccounts.length > 0 && effectivelySelected.length === selectableVisibleAccounts.length;

  const {
    showAssignModal, assigning, assignProgress, assignErrors,
    assignUsersByBm, selectedAssignUserByBm, setSelectedAssignUserByBm,
    assignUsersLoading, assignUsersError, assignBms, hasBmSelectionForAll,
    openAssignModal, confirmAssignSelected, closeAssignModal, resetAddUserState,
  } = useAddUserToAdAccounts({ effectivelySelected, sessionId, graphVersion: GRAPH_VERSION, toast });

  // ── Extension event listeners ────────────────────────────────────────
  useEffect(() => {
    const updateFromLocalStorage = () => {
      setExtensionLiveState((prev) => {
        const next = readExtensionLiveState();
        if (!prev && !next) return prev;
        if (prev?.updatedAt && next?.updatedAt && prev.updatedAt === next.updatedAt) return prev;
        return next;
      });
    };
    const onStorage = (event) => { if (event.key === LS_EXTENSION_STATE_KEY) updateFromLocalStorage(); };
    const onLiveState = (event) => { setExtensionLiveState(normalizeExtensionState(event.detail || null)); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EXTENSION_STATE_EVENT, onLiveState);
    const pollId = setInterval(updateFromLocalStorage, 1500);
    updateFromLocalStorage();
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(EXTENSION_STATE_EVENT, onLiveState); clearInterval(pollId); };
  }, []);

  useEffect(() => {
    const onBridgeReady = () => setExtensionBridgeReady(true);
    const pingBridge = () => window.dispatchEvent(new CustomEvent(EXTENSION_BRIDGE_PING_EVENT));
    window.addEventListener(EXTENSION_BRIDGE_READY_EVENT, onBridgeReady);
    pingBridge();
    const pingId = setInterval(pingBridge, 2500);
    return () => { clearInterval(pingId); window.removeEventListener(EXTENSION_BRIDGE_READY_EVENT, onBridgeReady); };
  }, []);

  const sendExtensionCommand = useCallback((type, payload = {}) => {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      let timeoutId = null;
      const onResponse = (event) => {
        const detail = event?.detail;
        if (!detail || detail.requestId !== requestId) return;
        window.removeEventListener(EXTENSION_RESPONSE_EVENT, onResponse);
        if (timeoutId) clearTimeout(timeoutId);
        setExtensionBridgeReady(true);
        if (detail.ok) { resolve(detail.response || {}); return; }
        reject(new Error(detail.error || detail.response?.error || "Extension request failed"));
      };
      window.addEventListener(EXTENSION_RESPONSE_EVENT, onResponse);
      try {
        window.dispatchEvent(new CustomEvent(EXTENSION_COMMAND_EVENT, { detail: { requestId, type, payload } }));
      } catch (error) { window.removeEventListener(EXTENSION_RESPONSE_EVENT, onResponse); reject(error); return; }
      timeoutId = setTimeout(() => {
        window.removeEventListener(EXTENSION_RESPONSE_EVENT, onResponse);
        reject(new Error("Extension bridge unavailable. Reload extension and keep this dashboard tab open."));
      }, 4500);
    });
  }, []);

  async function clearRunnerStatsAndLogs() {
    try { await sendExtensionCommand("RESET", { clearAll: true }); } catch { }
  }

  const refreshExtensionState = useCallback(async () => {
    try {
      const response = await sendExtensionCommand("GET_STATE");
      setExtensionLiveState(normalizeExtensionState(response?.state));
      return response?.state || null;
    } catch { return null; }
  }, [sendExtensionCommand]);

  const refreshRunnerSettings = useCallback(async () => {
    try {
      const response = await sendExtensionCommand("GET_SETTINGS");
      const settings = response?.settings;
      if (!settings) return;
      setRunnerSettings({
        batchSize: Number(settings.batchSize) || 10,
        tabDelaySec: Math.round(((Number(settings.tabDelay) || 500) / 1000) * 2) / 2,
        batchPauseSec: Math.round((Number(settings.batchPause) || 1000) / 1000),
      });
      setSettingsDirty(false);
    } catch { }
  }, [sendExtensionCommand]);

  useEffect(() => {
    if (!extensionBridgeReady) return;
    refreshExtensionState();
    refreshRunnerSettings();
  }, [extensionBridgeReady, refreshExtensionState, refreshRunnerSettings]);

  // ── Sync extension results back to accounts + DB ─────────────────────
  useEffect(() => {
    const extensionAccounts = extensionLiveState?.accounts;
    if (!Array.isArray(extensionAccounts) || extensionAccounts.length === 0) return;

    const successResults = new Set(["success", "success_uncertain"]);
    const failureResults = new Set(["error", "payment_error", "no_button"]);
    const extensionById = new Map(extensionAccounts.map((a) => [a.id, a]));

    setAccounts((prev) =>
      prev.map((account) => {
        const extAccount = extensionById.get(account.id);
        if (!extAccount) return account;
        let nextResult = account.result;
        if (successResults.has(extAccount.result)) nextResult = "processed";
        else if (failureResults.has(extAccount.result)) nextResult = "failed";
        return {
          ...account,
          result: nextResult,
          extensionResult: extAccount.result || account.extensionResult || null,
          extensionDetail: extAccount.detail || account.extensionDetail || "",
          ...(failureResults.has(extAccount.result) ? { paidVerified: false, paidVerificationPending: false, payableVisibilityEpoch: null } : {}),
        };
      })
    );

    if (!sessionId) return;

    extensionAccounts.forEach((extAccount) => {
      if (!successResults.has(extAccount.result) || !extAccount.id) return;
      const verificationKey = `${extAccount.id}:${extAccount.completedAt || "pending"}`;
      if (verifiedBalanceRequestRef.current.has(verificationKey)) return;
      verifiedBalanceRequestRef.current.add(verificationKey);

      setAccounts((prev) => prev.map((account) =>
        account.id === extAccount.id ? { ...account, paidVerificationPending: true } : account
      ));

      // Server-side balance verification
      fetch("/api/meta/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, accountId: extAccount.id }),
      })
        .then((res) => res.json())
        .then((apiAccount) => {
          if (apiAccount.error) throw new Error(apiAccount.error);
          setAccounts((prev) =>
            prev.map((account) =>
              account.id === extAccount.id
                ? { ...account, balance: apiAccount.balance, currency: apiAccount.currency || account.currency, status: apiAccount.status ?? account.status, paidVerified: apiAccount.paidVerified, paidVerificationPending: false, payableVisibilityEpoch: apiAccount.paidVerified ? userActivityEpoch : null }
                : account
            )
          );
        })
        .catch(() => {
          setAccounts((prev) => prev.map((account) =>
            account.id === extAccount.id ? { ...account, paidVerificationPending: false } : account
          ));
        });
    });
  }, [extensionLiveState?.accounts, sessionId, userActivityEpoch]);

  async function runExtensionCommand(type, payload = {}, successMessage = "") {
    setRunnerBusy(true);
    try {
      const response = await sendExtensionCommand(type, payload);
      if (response?.ok === false) throw new Error(response.error || "Extension command failed");
      if (successMessage) toast(successMessage, "success");
      await refreshExtensionState();
      return response;
    } catch (error) {
      toast(error?.message || "Extension command failed", "error");
      return null;
    } finally { setRunnerBusy(false); }
  }

  async function startPayingSelected() {
    if (effectivelySelected.length === 0) { toast("Select at least one account to start paying", "error"); return; }
    const accountsForExtension = effectivelySelected.map((a) => ({ id: a.id, name: a.name, url: a.url, status: a.status, bmId: a.bmId }));
    setRunnerBusy(true);
    try {
      const loadResponse = await sendExtensionCommand("LOAD_ACCOUNTS", { accounts: accountsForExtension });
      if (loadResponse?.ok === false) throw new Error(loadResponse.error || "Failed to load selected accounts");
      const startResponse = await sendExtensionCommand("START");
      if (startResponse?.ok === false) throw new Error(startResponse.error || "Failed to start automation");
      toast(`Started paying ${accountsForExtension.length} account(s)`, "success");
      await refreshExtensionState();
    } catch (error) {
      toast(error?.message || "Failed to start paying selected accounts", "error");
    } finally { setRunnerBusy(false); }
  }

  async function saveRunnerSettings() {
    const batchSize = Math.min(200, Math.max(1, parseInt(runnerSettings.batchSize, 10) || 3));
    const tabDelaySec = Math.min(15, Math.max(0.5, parseFloat(runnerSettings.tabDelaySec) || 2));
    const tabDelay = Math.round(tabDelaySec * 1000);
    const batchPauseSec = Math.min(180, Math.max(1, parseInt(runnerSettings.batchPauseSec, 10) || 12));
    const response = await runExtensionCommand("SET_SETTINGS", { settings: { batchSize, tabDelay, batchPause: batchPauseSec * 1000 } }, "Runner settings saved");
    if (response?.settings) {
      setRunnerSettings({ batchSize: response.settings.batchSize, tabDelaySec: Math.round(((Number(response.settings.tabDelay) || 2000) / 1000) * 2) / 2, batchPauseSec: Math.round(response.settings.batchPause / 1000) });
      setSettingsDirty(false);
    }
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setUnselected((s) => { const n = new Set(s); selectableVisibleAccounts.forEach((a) => n.add(a.id)); return n; });
    } else {
      setUnselected((s) => { const n = new Set(s); selectableVisibleAccounts.forEach((a) => n.delete(a.id)); return n; });
    }
  }

  function toggleSelect(id) {
    setUnselected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function buildExportData() {
    return JSON.stringify(effectivelySelected.map((a) => ({ id: a.id, name: a.name, url: a.url, status: a.status, bmId: a.bmId })), null, 2);
  }

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, buildExportData()); } catch { }
  }, [unselected, filtered]);

  // ── Stats ────────────────────────────────────────────────────────────
  const statsSourceAccounts = filtered;
  const paidStatsSourceAccounts = accounts.filter(matchesSearchAndStatus);
  const stats = {
    total: statsSourceAccounts.length,
    pending: statsSourceAccounts.filter((a) => a.result === "pending").length,
    processed: statsSourceAccounts.filter((a) => a.result === "processed").length,
    opened: statsSourceAccounts.filter((a) => a.result === "opened").length,
  };

  const extensionStats = extensionLiveState?.stats || null;
  const verifiedPaid = paidStatsSourceAccounts.filter(isPaidAccount).length;
  const fallbackFailed = statsSourceAccounts.filter((a) => ["error","payment_error","no_button","failed"].includes(a.result)).length;

  const mergedTotal = stats.total;
  const mergedPending = stats.pending;
  const mergedProcessed = stats.processed;
  const mergedPaid = verifiedPaid;
  const mergedFailed = fallbackFailed;
  const mergedCompleted = mergedProcessed + mergedFailed;
  const mergedPct = mergedTotal > 0 ? Math.round((mergedCompleted / mergedTotal) * 100) : 0;

  const extensionStatus = !extensionStats ? "Idle" : extensionLiveState?.running ? "Running" : extensionLiveState?.finishedAt ? "Finished" : "Ready";
  const extensionIsRunning = !!extensionLiveState?.running;
  const extensionHasFailures = (extensionStats?.failed || 0) > 0;
  const extensionLogs = extensionLiveState?.logs || [];
  const extensionLogsTail = extensionLogs.slice(-200);
  const primaryRunnerLabel = extensionIsRunning ? "Running..." : `Start Paying (${effectivelySelected.length})`;
  const primaryRunnerDisabled = runnerBusy || extensionIsRunning || effectivelySelected.length === 0;
  const combinedFilterValue = filterHasBalance ? "balance:payable" : selectedStatuses.includes("all") ? "status:all" : `status:${selectedStatuses[0] ?? "all"}`;
  const extensionUpdatedLabel = extensionLiveState?.updatedAt ? new Date(extensionLiveState.updatedAt).toLocaleTimeString() : "-";

  function updateRunnerSetting(key, value) {
    const nextValue = key === "tabDelaySec" ? parseFloat(value) : parseInt(value, 10);
    setRunnerSettings((prev) => ({ ...prev, [key]: Number.isFinite(nextValue) ? nextValue : prev[key] }));
    setSettingsDirty(true);
  }

  function handleCombinedFilterChange(value) {
    markUserActivity();
    if (value.startsWith("balance:")) { setFilterHasBalance(true); setSelectedStatuses(["all"]); return; }
    const statusValue = value.replace("status:", "");
    setFilterHasBalance(false);
    setSelectedStatuses(statusValue === "all" ? ["all"] : [Number(statusValue)]);
  }

  const step = !appIdSaved ? 0 : !sessionId ? 1 : accounts.length === 0 ? 2 : 3;

  return (
    <>
      <style>{css}</style>

      {/* Facebook SDK */}
      {appIdSaved && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={handleFbSdkLoad}
        />
      )}

      {/* Header */}
      <div className="header">
        <div className="container">
          <div className="header-inner">
            <div className="header-logo">
              <div className="header-icon">💳</div>
              <div>
                <div className="header-title">Meta Balance Tool</div>
                <div className="header-sub">Bulk billing recovery for Ad Accounts</div>
              </div>
            </div>
            <div className="header-right">
              {user && (
                <div className="user-chip">
                  <div className="user-avatar">{user.name?.[0] || "?"}</div>
                  <span>{user.name}</span>
                </div>
              )}
              <button className="btn btn-danger btn-sm" onClick={handleResetApp}>Reset App</button>
              {sessionId && <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Disconnect</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 48, paddingBottom: 80 }} onPointerDown={markUserActivity}>
        {accounts.length === 0 && (
          <div className="hero">
            <p className="hero-sub">Connect your Facebook account, select which billing statuses to target, and get a list of billing URLs ready for the extension to process.</p>
          </div>
        )}

        {/* Steps */}
        <div className="steps">
          {["App Setup", "Connect FB", "Select BMs", "Process"].map((label, i) => (
            <div key={i} className={`step ${i < step ? "done" : i === step ? "active" : ""}`}>
              <div className="step-dot">{i < step ? "✓" : i + 1}</div>
              <div className="step-label">{label}</div>
            </div>
          ))}
        </div>

        {/* Step 0 — App ID */}
        {!appIdSaved && (
          <div className="card" style={{ maxWidth: 540, margin: "0 auto" }}>
            <div className="card-title">🔧 Facebook App Configuration</div>
            <label className="input-label">Your Facebook App ID</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="app-id-input" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="123456789012345" onKeyDown={(e) => e.key === "Enter" && saveAppId()} />
              <button className="btn btn-primary" onClick={saveAppId}>Save</button>
            </div>
            <div className="input-hint">
              Found in <strong>developers.facebook.com</strong> → Your App → App Settings → Basic.<br />
              Your app must have <code>ads_read</code> and <code>business_management</code> in its permissions.
            </div>
          </div>
        )}

        {/* Step 1 — Login */}
        {appIdSaved && !sessionId && (
          <div className="card" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
            <div className="card-title" style={{ justifyContent: "center" }}>Connect Facebook Account</div>
            <p style={{ color: G.text2, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              We'll request <strong>ads_read</strong> and <strong>business_management</strong> permissions to fetch your ad accounts across all Business Managers.
            </p>
            <button className="btn btn-fb" onClick={handleLogin} disabled={!fbReady}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Continue with Facebook
            </button>
            {!fbReady && <p style={{ color: G.text3, fontSize: 11, marginTop: 12 }}>Loading Facebook SDK…</p>}
          </div>
        )}

        {/* Step 2 — Select BMs */}
        {appIdSaved && sessionId && accounts.length === 0 && !fetching && (
          <div className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
            {!bmsFetched ? (
              <>
                <div className="card-title">🏢 Fetch Business Managers</div>
                <p style={{ color: G.text2, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>First, load all your Business Managers to choose which ones to scan for Ad Accounts.</p>
                <button className="btn btn-primary" onClick={fetchBMs} style={{ width: "100%", justifyContent: "center", padding: "12px" }}>🏢 Load Business Managers</button>
              </>
            ) : (
              <>
                <div className="card-title">🏢 Select Business Managers</div>
                <p style={{ color: G.text2, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>Choose which Business Managers to scan for Ad Accounts.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${G.border}` }}>
                  <input type="checkbox" checked={selectedBMs.size === businesses.length && businesses.length > 0} onChange={(e) => { if (e.target.checked) setSelectedBMs(new Set(businesses.map((b) => b.id))); else setSelectedBMs(new Set()); }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Select All BMs ({businesses.length})</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  {businesses.map((bm) => (
                    <label key={bm.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: G.surface2, padding: "10px 14px", borderRadius: 8, border: `1px solid ${selectedBMs.has(bm.id) ? G.accent : G.border}` }}>
                      <input type="checkbox" checked={selectedBMs.has(bm.id)} onChange={(e) => { const n = new Set(selectedBMs); if (e.target.checked) n.add(bm.id); else n.delete(bm.id); setSelectedBMs(n); }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{bm.name || bm.id}</span>
                      <span style={{ fontSize: 11, color: G.text3, fontFamily: "monospace" }}>{bm.id}</span>
                    </label>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={fetchAdAccounts} disabled={selectedBMs.size === 0} style={{ width: "100%", justifyContent: "center", padding: "12px" }}>🔍 Fetch Ad Accounts</button>
              </>
            )}
          </div>
        )}

        {/* Fetching progress */}
        {fetching && (
          <div className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
            <div className="card-title">
              <div className="spinner" style={{ width: 16, height: 16 }} />
              Scanning Business Managers…
            </div>
            <div className="fetch-bm-list">
              {fetchLog.map((bm, i) => (
                <div key={i} className="fetch-bm-row">
                  {bm.status === "loading" && <div className="spinner" />}
                  {bm.status === "done" && <span style={{ color: G.success }}>✓</span>}
                  {bm.status === "error" && <span style={{ color: G.error }}>✗</span>}
                  <span style={{ flex: 1 }}>{bm.bmName || bm.bmId}</span>
                  {bm.status === "done" && <span style={{ fontFamily: "monospace", fontSize: 11, color: G.text2 }}>{bm.count} matching / {bm.total} total</span>}
                  {bm.status === "error" && <span style={{ fontSize: 11, color: G.error }}>{bm.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Account list */}
        {accounts.length > 0 && (
          <>
            <div className="stats-panel">
              <div className="stats-strip">
                {[
                  { val: mergedTotal, lbl: "Total", color: G.accent },
                  { val: mergedPending, lbl: "Pending", color: G.warn },
                  { val: mergedProcessed, lbl: "Processed", color: G.success },
                  { val: mergedPaid, lbl: "Paid/Processed", color: G.success },
                  { val: mergedFailed, lbl: "Failed", color: G.error },
                  { val: `${mergedPct}%`, lbl: "Completed %", color: G.text },
                ].map(({ val, lbl, color }) => (
                  <div key={lbl} className="stat-block">
                    <div className="stat-val" style={{ color }}>{val}</div>
                    <div className="stat-lbl">{lbl}</div>
                  </div>
                ))}
              </div>
              <div className="stats-progress">
                <div className="progress-row">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: mergedPct + "%" }} /></div>
                  <span className="progress-label">{mergedCompleted}/{mergedTotal}</span>
                </div>
              </div>
            </div>

            {extensionStats && (
              <div style={{ marginTop: 4, marginBottom: 16, color: G.text2, fontSize: 11 }}>
                Status: {extensionStatus} | Last update: {extensionUpdatedLabel}
              </div>
            )}

            {/* Runner Controls */}
            <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
              <div className="card-title" style={{ marginBottom: 12, fontSize: 13, justifyContent: "space-between", flexWrap: "wrap", rowGap: 8 }}>
                <span>⚡ Runner Controls</span>
                <div role="tablist" style={{ display: "flex", gap: 8 }}>
                  {[["actions", "Actions"], ["settings", `Settings${settingsDirty ? " • Unsaved" : ""}`], ["logs", `Logs (${extensionLogs.length})`]].map(([tab, label]) => (
                    <button key={tab} type="button" className="btn btn-ghost btn-xs" role="tab" aria-selected={runnerPanelTab === tab}
                      onClick={() => setRunnerPanelTab(tab)}
                      style={{ background: runnerPanelTab === tab ? G.accentDim : "#ffffff", borderColor: runnerPanelTab === tab ? `${G.accent}50` : G.border, color: runnerPanelTab === tab ? G.accent : G.text2 }}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${G.border}`, paddingTop: 14 }}>
                {runnerPanelTab === "actions" ? (
                  <div>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: extensionBridgeReady ? G.success : G.warn }}>Extension: {extensionBridgeReady ? "Connected" : "Waiting"}</span>
                      <span style={{ fontSize: 12, color: G.text2 }}>Runner: {extensionStatus}</span>
                      <span style={{ fontSize: 12, color: G.text2 }}>Queue: {extensionLiveState?.accountCount || 0}</span>
                      <button className="btn btn-ghost btn-xs" onClick={() => { refreshExtensionState(); refreshRunnerSettings(); }} disabled={runnerBusy} style={{ marginLeft: "auto" }}>Refresh</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={startPayingSelected} disabled={primaryRunnerDisabled}>{primaryRunnerLabel}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => runExtensionCommand("STOP", {}, "Runner stopped")} disabled={runnerBusy || !extensionIsRunning}>Stop</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => runExtensionCommand("RETRY_FAILED", {}, "Failed accounts reset")} disabled={runnerBusy || extensionIsRunning || !extensionHasFailures}>Retry Failed</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (!window.confirm("Reset extension queue and clear all runner progress?")) return; runExtensionCommand("RESET", { clearAll: false }, "Extension queue reset"); }} disabled={runnerBusy}>Reset Queue</button>
                    </div>
                  </div>
                ) : runnerPanelTab === "settings" ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                      {[
                        { key: "batchSize", label: "Batch Size", min: 1, max: 200, step: 1, display: runnerSettings.batchSize },
                        { key: "tabDelaySec", label: "Tab Delay (sec)", min: 0.5, max: 15, step: 0.5, display: `${Number(runnerSettings.tabDelaySec).toFixed(1)}s` },
                        { key: "batchPauseSec", label: "Batch Pause (sec)", min: 1, max: 180, step: 1, display: `${runnerSettings.batchPauseSec}s` },
                      ].map(({ key, label, min, max, step, display }) => (
                        <label key={key} style={{ fontSize: 12, color: G.text2 }}>
                          {label}: {display}
                          <input type="range" min={min} max={max} step={step} value={runnerSettings[key]} onChange={(e) => updateRunnerSetting(key, e.target.value)} style={{ marginTop: 6, width: "100%", accentColor: G.accent, cursor: "pointer" }} />
                        </label>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveRunnerSettings} disabled={runnerBusy || !settingsDirty}>Save Settings</button>
                      {settingsDirty && <span style={{ fontSize: 11, color: G.warn }}>Unsaved changes</span>}
                    </div>
                  </>
                ) : (
                  <div style={{ maxHeight: "min(220px, 30vh)", overflowY: "auto", overflowX: "hidden", wordBreak: "break-word", background: G.surface2, border: `1px solid ${G.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                    {extensionLogs.length === 0 ? (
                      <div style={{ color: G.text3 }}>No extension logs yet.</div>
                    ) : (
                      extensionLogsTail.map((entry, index) => (
                        <div key={`${entry.ts || index}_${index}`} style={{ color: G.text2, lineHeight: 1.5, paddingBottom: 4, marginBottom: 4, borderBottom: index === extensionLogsTail.length - 1 ? "none" : `1px solid ${G.border}` }}>
                          <span style={{ color: G.text3, marginRight: 8 }}>{entry?.ts ? new Date(entry.ts).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</span>
                          <span>{entry?.msg || "(empty log entry)"}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="table-wrap">
              <div className="table-tools">
                <input className="search-input" placeholder="Search by name, ID, or Business Manager…" value={search} onChange={(e) => { markUserActivity(); setSearch(e.target.value); }} />
                <select value={combinedFilterValue} onChange={(e) => handleCombinedFilterChange(e.target.value)} style={{ background: G.surface2, border: `1px solid ${G.border}`, color: G.text, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  <option value="status:all">All Accounts</option>
                  <option value="balance:payable">Has Payable Balance</option>
                  {SELECTABLE_STATUSES.map((s) => <option key={s.code} value={`status:${s.code}`}>Status: {s.label}</option>)}
                </select>
                <div className="table-tools-spacer" />
                <button className="btn btn-primary btn-sm" onClick={openAssignModal} disabled={effectivelySelected.length === 0}>Add User to ad accounts</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { void clearRunnerStatsAndLogs(); setAccounts([]); setFetchLog([]); setBmsFetched(false); setSelectedBMs(new Set()); localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_STATE_KEY); localStorage.removeItem(LS_EXTENSION_STATE_KEY); setExtensionLiveState(null); if (user?.id) fetch(`/api/meta/accounts?userId=${user.id}`, { method: "DELETE" }); }}>🔄 Re-fetch</button>
              </div>
              <div className="select-row">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                <span>{effectivelySelected.length > 0 ? `${effectivelySelected.length} auto-selected` : `Select all visible (${selectableVisibleAccounts.length})`}</span>
                {effectivelySelected.length > 0 && <button className="btn btn-ghost btn-xs" onClick={() => setUnselected(new Set(selectableVisibleAccounts.map((a) => a.id)))}>Clear</button>}
              </div>
              <div className="table-header">
                <div>Account</div>
                <div>Business Manager</div>
                <div>Status</div>
                <div>Balance</div>
                <div>Action</div>
              </div>
              {filtered.length === 0 ? (
                <div className="empty"><div className="empty-icon">🔍</div><div>No accounts match your search</div></div>
              ) : (
                filtered.map((acc) => (
                  <div key={acc.id} className={`table-row ${acc.result === "processed" ? "processed" : ""}`}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <input type="checkbox" checked={!isPaidAccount(acc) && !unselected.has(acc.id)} disabled={isPaidAccount(acc)} onChange={() => toggleSelect(acc.id)} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="acct-name">{acc.name}</div>
                        <div className="acct-id">{acc.id}</div>
                      </div>
                    </div>
                    <div className="acct-bm" title={acc.bmName}>{acc.bmName}</div>
                    <div><StatusPill status={acc.status} /></div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: G.text2 }}>
                      {acc.currency ? new Intl.NumberFormat("en-US", { style: "currency", currency: acc.currency }).format(acc.balance / 100) : `${acc.balance}`}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openAccount(acc)} title="Open billing page">↗ Open</button>
                      {acc.paidVerificationPending && <span title="Verifying payment with Graph API" style={{ color: G.warn, fontSize: 10, fontWeight: 700, lineHeight: 1, display: "inline-flex", alignItems: "center", padding: "0 2px" }}>⏳ Verifying</span>}
                      {acc.paidVerified && <span title="Balance verified as zero" style={{ color: G.success, fontSize: 13, fontWeight: 800, lineHeight: 1, display: "inline-flex", alignItems: "center", padding: "0 2px" }}>✓</span>}
                      <ResultPill result={acc.result} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <AddUserToAdAccountsModal
        show={showAssignModal}
        assigning={assigning}
        assignProgress={assignProgress}
        assignBms={assignBms}
        assignUsersByBm={assignUsersByBm}
        selectedAssignUserByBm={selectedAssignUserByBm}
        setSelectedAssignUserByBm={setSelectedAssignUserByBm}
        assignUsersLoading={assignUsersLoading}
        assignUsersError={assignUsersError}
        hasBmSelectionForAll={hasBmSelectionForAll}
        onConfirm={confirmAssignSelected}
        onClose={closeAssignModal}
        assignErrors={assignErrors}
        G={G}
      />

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}
