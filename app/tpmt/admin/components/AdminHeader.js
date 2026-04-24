"use client";

import { useRouter, usePathname } from "next/navigation";

export default function AdminHeader({ onLogout }) {
  const router = useRouter();
  const pathname = usePathname();

  const active = pathname.startsWith("/tpmt/admin/businesses")
    ? "businesses"
    : "sessions";

  return (
    <div style={S.header}>
      <div style={S.headerInner}>
        <button style={S.brand} onClick={() => router.push("/tpmt/admin/sessions")}>
          🛡️ Admin Area
        </button>
        <div style={{ flex: 1 }} />
        <nav style={S.nav}>
          <button
            style={{ ...S.navBtn, ...(active === "sessions" ? S.navActive : {}) }}
            onClick={() => router.push("/tpmt/admin/sessions")}
          >
            Sessions
          </button>
          <button
            style={{ ...S.navBtn, ...(active === "businesses" ? S.navActive : {}) }}
            onClick={() => router.push("/tpmt/admin/businesses")}
          >
            Businesses
          </button>
        </nav>
        <button style={S.logoutBtn} onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}

const S = {
  header: { background: "#fff", borderBottom: "1px solid #ccd0d5", position: "sticky", top: 0, zIndex: 20 },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 48, display: "flex", alignItems: "center", gap: 8 },
  brand: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: "#1877f2", padding: 0 },
  nav: { display: "flex", alignItems: "center", gap: 2 },
  navBtn: { background: "none", border: "none", padding: "5px 12px", fontSize: 13, cursor: "pointer", color: "#606770", fontFamily: "inherit", borderRadius: 6 },
  navActive: { color: "#1877f2", fontWeight: 700 },
  logoutBtn: { background: "none", border: "1px solid #ccd0d5", borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer", color: "#606770", fontFamily: "inherit" },
};
