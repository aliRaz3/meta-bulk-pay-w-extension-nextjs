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

// POST: fetch all ad accounts for given BM IDs
export async function POST(request) {
  try {
    const { token, userId, bmIds, businesses } = await request.json();
    console.log('userId', userId)
    if (!token || !bmIds || bmIds.length === 0) {
      return Response.json({ error: "token and bmIds required" }, { status: 400 });
    }

    const session = userId
      ? await prisma.session.findUnique({ where: { userId } })
      : null;

    const bmsToProcess = businesses.filter((b) => bmIds.includes(b.id));
    const fetchResults = [];
    const allAccounts = [];

    for (const bm of bmsToProcess) {
      try {
        const accts = await graphGetAll(`${bm.id}/owned_ad_accounts`, token, {
          fields: "id,name,account_status,currency,balance",
        });

        const mapped = accts.map((a) => ({
          id: a.id,
          name: a.name || a.id,
          status: a.account_status,
          currency: a.currency || "USD",
          balance: Number(a.balance) || 0,
          disableReason: a.disable_reason || null,
          bmId: bm.id,
          bmName: bm.name,
          url: billingUrl(a.id, bm.id),
          result: "pending",
        }));

        // Persist to DB
        if (session) {
          for (const acc of mapped) {
            await prisma.adAccount.upsert({
              where: { id: acc.id },
              update: {
                name: acc.name,
                accountStatus: acc.status,
                currency: acc.currency,
                balance: acc.balance,
                bmId: acc.bmId,
                bmName: acc.bmName,
                url: acc.url,
                result: "pending",
                sessionId: session.id,
              },
              create: {
                id: acc.id,
                name: acc.name,
                accountStatus: acc.status,
                currency: acc.currency,
                balance: acc.balance,
                disableReason: acc.disableReason,
                bmId: acc.bmId,
                bmName: acc.bmName,
                url: acc.url,
                result: "pending",
                sessionId: session.id,
              },
            });
          }
        }

        fetchResults.push({ bmId: bm.id, bmName: bm.name, status: "done", count: mapped.length, total: accts.length });
        allAccounts.push(...mapped);
      } catch (e) {
        fetchResults.push({ bmId: bm.id, bmName: bm.name, status: "error", error: e.message, count: 0 });
      }
    }

    return Response.json({ accounts: allAccounts, fetchResults });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// GET: load accounts from DB
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  try {
    const session = await prisma.session.findUnique({ where: { userId } });
    if (!session) return Response.json({ accounts: [] });

    const accounts = await prisma.adAccount.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });

    const mapped = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.accountStatus,
      currency: a.currency,
      balance: a.balance,
      disableReason: a.disableReason,
      bmId: a.bmId,
      bmName: a.bmName,
      url: a.url,
      result: a.result,
      paidVerified: a.paidVerified,
      extensionResult: a.extensionResult,
      extensionDetail: a.extensionDetail,
    }));

    return Response.json({ accounts: mapped });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH: update account result/status
export async function PATCH(request) {
  try {
    const { accountId, result, balance, status, paidVerified, extensionResult, extensionDetail } = await request.json();
    if (!accountId) return Response.json({ error: "accountId required" }, { status: 400 });

    const updateData = {};
    if (result !== undefined) updateData.result = result;
    if (balance !== undefined) updateData.balance = balance;
    if (status !== undefined) updateData.accountStatus = status;
    if (paidVerified !== undefined) updateData.paidVerified = paidVerified;
    if (extensionResult !== undefined) updateData.extensionResult = extensionResult;
    if (extensionDetail !== undefined) updateData.extensionDetail = extensionDetail;

    const updated = await prisma.adAccount.update({
      where: { id: accountId },
      data: updateData,
    });

    return Response.json({ ok: true, account: updated });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: clear all accounts for session
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  try {
    const session = await prisma.session.findUnique({ where: { userId } });
    if (session) {
      await prisma.adAccount.deleteMany({ where: { sessionId: session.id } });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
