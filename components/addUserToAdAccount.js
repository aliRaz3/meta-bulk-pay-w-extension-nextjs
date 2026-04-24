"use client";

import { useCallback, useMemo, useState } from "react";

export const ASSIGN_CONCURRENCY = 500;

async function runWithConcurrency(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  const parallelism = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;
  const runners = Array.from({ length: parallelism }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
}

function getInitialAssignProgress(total = 0) {
  return { assigned: 0, completed: 0, failed: 0, total };
}

export function useAddUserToAdAccounts({ effectivelySelected, sessionId, graphVersion, toast }) {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignTargets, setAssignTargets] = useState([]);
  const [assignProgress, setAssignProgress] = useState(getInitialAssignProgress());
  const [assignErrors, setAssignErrors] = useState([]);
  const [assignUsersByBm, setAssignUsersByBm] = useState({});
  const [selectedAssignUserByBm, setSelectedAssignUserByBm] = useState({});
  const [assignUsersLoading, setAssignUsersLoading] = useState(false);
  const [assignUsersError, setAssignUsersError] = useState("");

  const assignBms = useMemo(
    () =>
      [...new Map(assignTargets.map((t) => [t.bmId, t.bmName || t.bmId])).entries()].map(([bmId, bmName]) => ({ bmId, bmName })),
    [assignTargets]
  );

  const hasBmSelectionForAll = useMemo(
    () => assignBms.length > 0 && assignBms.every((bm) => !!selectedAssignUserByBm[bm.bmId]),
    [assignBms, selectedAssignUserByBm]
  );

  const resetAddUserState = useCallback(() => {
    setShowAssignModal(false); setAssigning(false); setAssignTargets([]);
    setAssignProgress(getInitialAssignProgress()); setAssignErrors([]);
    setAssignUsersByBm({}); setSelectedAssignUserByBm({});
    setAssignUsersLoading(false); setAssignUsersError("");
  }, []);

  const closeAssignModal = useCallback(() => setShowAssignModal(false), []);

  const openAssignModal = useCallback(async () => {
    if (!sessionId) { toast("Session not ready", "error"); return; }
    const targets = effectivelySelected.map((a) => ({ id: a.id, name: a.name, bmId: a.bmId, bmName: a.bmName || a.bmId }));
    if (targets.length === 0) { toast("Select at least one ad account", "error"); return; }

    setAssignTargets(targets);
    setAssignProgress(getInitialAssignProgress(targets.length));
    setAssignErrors([]); setAssignUsersByBm({}); setSelectedAssignUserByBm({});
    setAssignUsersError(""); setAssignUsersLoading(true); setAssigning(false);
    setShowAssignModal(true);

    const uniqueBusinesses = [...new Map(targets.map((t) => [t.bmId, t.bmName])).entries()].map(([bmId, bmName]) => ({ bmId, bmName }));

    try {
      // Server-side fetch of business users
      const res = await fetch("/api/meta/business-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, businesses: uniqueBusinesses }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setAssignUsersByBm(data.usersByBm);
      setSelectedAssignUserByBm(data.selectedByBm);
      if (data.loadErrors && data.loadErrors.length > 0) {
        setAssignUsersError(data.loadErrors.join("\n"));
      }
    } catch (e) {
      const message = e?.message || "Unknown error";
      setAssignUsersError(`Failed to load business users: ${message}`);
      toast(`Failed to load business users: ${message}`, "error");
    } finally {
      setAssignUsersLoading(false);
    }
  }, [effectivelySelected, graphVersion, toast, sessionId]);

  const confirmAssignSelected = useCallback(async () => {
    if (assigning) return;
    if (!sessionId) { toast("Session not ready", "error"); return; }
    if (assignTargets.length === 0) { toast("No selected ad accounts to assign", "error"); return; }

    const requiredBmIds = [...new Set(assignTargets.map((t) => t.bmId))];
    const missingBmSelection = requiredBmIds.some((bmId) => !selectedAssignUserByBm[bmId]);
    if (missingBmSelection) { toast("Select a user for each Business Manager", "error"); return; }

    setAssigning(true);
    let successCount = 0;
    let failedCount = 0;

    await runWithConcurrency(assignTargets, ASSIGN_CONCURRENCY, async (target) => {
      try {
        const selectedUserId = selectedAssignUserByBm[target.bmId];
        // Server-side assign call
        const res = await fetch("/api/meta/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, adAccountId: target.id, businessId: target.bmId, selectedUserId }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Assignment failed");
        successCount += 1;
        setAssignProgress((p) => ({ ...p, assigned: p.assigned + 1, completed: p.completed + 1 }));
      } catch (e) {
        failedCount += 1;
        const message = e?.message || "Unknown error";
        setAssignProgress((p) => ({ ...p, failed: p.failed + 1, completed: p.completed + 1 }));
        setAssignErrors((prev) => [...prev, `${target.name || target.id} (${target.id}): ${message}`]);
      }
    });

    setAssigning(false);
    if (failedCount > 0) {
      toast(`Assigned ${successCount} of ${assignTargets.length} selected ad accounts`, "info");
    } else {
      toast(`Successfully assigned all ${assignTargets.length} selected ad accounts`, "success");
    }
  }, [assigning, assignTargets, graphVersion, selectedAssignUserByBm, toast, sessionId]);

  return {
    showAssignModal, assigning, assignProgress, assignErrors,
    assignUsersByBm, selectedAssignUserByBm, setSelectedAssignUserByBm,
    assignUsersLoading, assignUsersError, assignBms, hasBmSelectionForAll,
    openAssignModal, confirmAssignSelected, closeAssignModal, resetAddUserState,
  };
}

export default function AddUserToAdAccountsModal({
  show, assigning, assignProgress, assignBms, assignUsersByBm,
  selectedAssignUserByBm, setSelectedAssignUserByBm, assignUsersLoading,
  assignUsersError, hasBmSelectionForAll, onConfirm, onClose, assignErrors, G,
}) {
  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (!assigning && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <div className="modal-title">Add User to ad accounts</div>

        {!assigning && assignProgress.completed === 0 && (
          <>
            <div style={{ marginBottom: 14, display: "grid", gap: 12 }}>
              {assignBms.map((bm) => {
                const users = assignUsersByBm[bm.bmId] || [];
                const selected = selectedAssignUserByBm[bm.bmId] || "";
                return (
                  <div key={bm.bmId}>
                    <label className="input-label" style={{ marginBottom: 8 }}>{`Select user for ${bm.bmName}`}</label>
                    <select
                      value={selected}
                      onChange={(e) => setSelectedAssignUserByBm((prev) => ({ ...prev, [bm.bmId]: e.target.value }))}
                      disabled={assignUsersLoading || assigning}
                      style={{ width: "100%", background: "#ffffff", border: `1px solid ${G.border}`, borderRadius: 6, color: G.text, padding: "10px 12px", fontSize: 13, outline: "none" }}
                    >
                      <option value="">{assignUsersLoading ? "Loading users..." : `Select user for ${bm.bmName}`}</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{`${u.name} (${u.role})`}</option>)}
                    </select>
                  </div>
                );
              })}

              {assignUsersError && (
                <div style={{ marginTop: 8, fontSize: 12, color: G.error, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{assignUsersError}</div>
              )}
            </div>

            <p style={{ color: G.text2, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              {`This will add the selected user to ${assignProgress.total} selected ad accounts with full control. Are you sure to proceed?`}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm} disabled={assignUsersLoading || !hasBmSelectionForAll}>Yes, proceed</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {(assigning || assignProgress.completed > 0) && (
          <>
            <p style={{ color: G.text2, fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
              {`Assigned ${assignProgress.assigned} of ${assignProgress.total} total selected accounts.`}
            </p>
            <div className="progress-row" style={{ marginBottom: 8 }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: assignProgress.total > 0 ? `${Math.round((assignProgress.completed / assignProgress.total) * 100)}%` : "0%" }} />
              </div>
              <span className="progress-label">{assignProgress.completed}/{assignProgress.total}</span>
            </div>
            <div style={{ fontSize: 12, color: G.text2, marginBottom: 12 }}>
              Success: {assignProgress.assigned} | Failed: {assignProgress.failed}
            </div>
            {assignErrors.length > 0 && <div className="code-block" style={{ marginBottom: 12 }}>{assignErrors.join("\n")}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              {assigning ? (
                <button className="btn btn-primary" disabled style={{ flex: 1 }}>Assigning...</button>
              ) : (
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
