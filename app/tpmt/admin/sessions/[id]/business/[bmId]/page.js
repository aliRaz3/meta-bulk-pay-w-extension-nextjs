"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import AdminHeader from "../../../../components/AdminHeader";

function BusinessDetail() {
  const router = useRouter();
  const { id, bmId } = useParams();

  const [business, setBusiness] = useState(null);
  const [headerError, setHeaderError] = useState("");
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/admin/businesses/${bmId}`, { signal: ctrl.signal });
      if (res.status === 401) { router.replace("/tpmt/admin"); return; }
      if (res.status === 404) { setHeaderError("Business not found"); return; }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setBusiness(data.business);
    } catch (e) {
      if (e.name !== "AbortError") setHeaderError(e.message);
    }
  }, [bmId, router]);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.replace("/tpmt/admin");
  }

  return (
    <div style={S.page}>
      <AdminHeader onLogout={handleLogout} />

      {headerError && (
        <div style={S.container}><div style={S.errorBox}>{headerError}</div></div>
      )}

      {business && (
        <div style={S.infoBar}>
          <div style={S.container}>
            <Breadcrumb
              crumbs={[
                { label: business.session.userName || id, href: `/tpmt/admin/sessions/${id}` },
                { label: business.name },
              ]}
            />

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

            <div style={{ borderTop: "1px solid #e4e6eb", marginTop: 14, paddingTop: 12 }}>
              <div style={S.sectionLabel}>Business</div>
              <div style={S.infoGrid}>
                <InfoItem label="Name" value={<strong>{business.name}</strong>} />
                <InfoItem label="BM ID" value={<code style={S.mono}>{business.id}</code>} />
                <InfoItem label="Ad Accounts" value={business.adAccountCount} />
              </div>
            </div>
          </div>
        </div>
      )}

      {!business && !headerError && (
        <div style={S.container}><div style={S.loading}>Loading…</div></div>
      )}
    </div>
  );
}

export default function BusinessDetailPage() {
  return <Suspense><BusinessDetail /></Suspense>;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────


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

function InfoItem({ label, value }) {
  return (
    <div>
      <div style={S.infoLabel}>{label}</div>
      <div style={S.infoVal}>{value}</div>
    </div>
  );
}

const S = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 14, color: "#1c1e21" },
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
};
