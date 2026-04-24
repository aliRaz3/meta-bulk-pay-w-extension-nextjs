import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v25.0";

function billingUrl(adAccountId, businessId) {
  const clean = adAccountId.replace("act_", "");
  return `https://business.facebook.com/latest/billing_hub/accounts/details/?payment_account_id=${clean}&business_id=${businessId}&asset_id=${clean}`;
}

async function graphGetAll(path, token, params = {}) {
  let results = [];
  let nextUrl = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    let data;
    if (nextUrl) {
      const res = await fetch(nextUrl);
      data = await res.json();
    } else {
      const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
      url.searchParams.set("access_token", token);
      url.searchParams.set("limit", "1000");
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const res = await fetch(url.toString());
      data = await res.json();
    }
    if (data.error) throw new Error(data.error.message);
    results = results.concat(data.data || []);
    nextUrl = data.paging?.next || null;
  }
  return results;
}

// POST: fetch all ad accounts for given BM IDs, persist counts to business table
export async function POST(request) {
  try {
    const { sessionId, bmIds, businesses } = await request.json();
    if (!sessionId || !bmIds || bmIds.length === 0) {
      return Response.json({ error: "sessionId and bmIds required" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const bmsToProcess = businesses.filter((b) => bmIds.includes(b.id));

    const bmResults = await Promise.all(
      bmsToProcess.map(async (bm) => {
        try {
          const accts = await graphGetAll(`${bm.id}/owned_ad_accounts`, session.token, {
            fields: "id,name,account_status,currency,balance,disable_reason",
          });

          const mapped = accts.map((a) => ({
            id: a.id,
            name: a.name || a.id,
            status: a.account_status,
            currency: a.currency || "USD",
            balance: Number(a.balance) || 0,
            disableReason: a.disable_reason ?? null,
            bmId: bm.id,
            bmName: bm.name,
            url: billingUrl(a.id, bm.id),
            result: "pending",
          }));

          // Store count on the business record
          await prisma.business.update({
            where: { id: bm.id },
            data: { adAccountCount: mapped.length, updatedAt: new Date() },
          });

          return { result: "done", bm, mapped, count: mapped.length, total: accts.length };
        } catch (e) {
          return { result: "error", bm, error: e.message };
        }
      })
    );

    const fetchResults = bmResults.map(({ result, bm, count = 0, total = 0, error }) =>
      result === "done"
        ? { bmId: bm.id, bmName: bm.name, status: "done", count, total }
        : { bmId: bm.id, bmName: bm.name, status: "error", error, count: 0 }
    );
    const allAccounts = bmResults.flatMap((r) =>
      r.result === "done" ? r.mapped.map((a) => ({ ...a, result: "pending" })) : []
    );

    return Response.json({ accounts: allAccounts, fetchResults });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
