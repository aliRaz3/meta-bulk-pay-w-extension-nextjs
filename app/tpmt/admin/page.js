"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/auth/check")
      .then((res) => {
        if (res.ok) router.replace("/tpmt/admin/sessions");
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/tpmt/admin/sessions");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.bg}>
        <div style={styles.topbar}><span style={styles.brand}>🛡️ Admin Area</span></div>
        <div style={{ marginTop: "20vh", color: "#8d949e", fontSize: 14, fontFamily: "inherit" }}>Checking session…</div>
      </div>
    );
  }

  return (
    <div style={styles.bg}>
      <div style={styles.topbar}>
        <span style={styles.brand}>🛡️ Admin Area</span>
      </div>
      <div style={styles.card}>
        <div style={styles.icon}>🛡️</div>
        <h1 style={styles.title}>Admin Dashboard</h1>
        <p style={styles.sub}>Enter your credentials to continue</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.btn} type="submit">Sign In</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: "100vh",
    background: "#f0f2f5",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  topbar: {
    width: "100%",
    background: "#fff",
    borderBottom: "1px solid #ccd0d5",
    padding: "0 24px",
    height: 48,
    display: "flex",
    alignItems: "center",
  },
  brand: {
    fontSize: 14,
    fontWeight: 800,
    color: "#1877f2",
  },
  card: {
    background: "#fff",
    border: "1px solid #ccd0d5",
    borderRadius: 10,
    padding: "40px 36px",
    width: 360,
    maxWidth: "90vw",
    textAlign: "center",
    boxShadow: "0 2px 16px #0000000f",
    marginTop: "10vh",
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 800, margin: "0 0 6px", color: "#1c1e21" },
  sub: { fontSize: 13, color: "#606770", margin: "0 0 28px" },
  form: { textAlign: "left", display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: "#606770", textTransform: "uppercase", letterSpacing: "0.06em" },
  input: {
    background: "#f5f6f7",
    border: "1px solid #ccd0d5",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#1c1e21",
    outline: "none",
    marginBottom: 10,
    width: "100%",
    boxSizing: "border-box",
  },
  error: {
    background: "#fff0f0",
    border: "1px solid #fa383e40",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 12,
    color: "#fa383e",
    marginBottom: 8,
  },
  btn: {
    background: "#1877f2",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "11px 0",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
    width: "100%",
  },
};
