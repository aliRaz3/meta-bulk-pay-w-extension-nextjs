import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v25.0";

export async function POST(request) {
  try {
    const { token, accountId } = await request.json();
    if (!token || !accountId) {
      return Response.json({ error: "token and accountId required" }, { status: 400 });
    }

    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("fields", "balance,currency,account_id,name,id,account_status");

    const res = await fetch(url.toString());
    const apiAccount = await res.json();

    if (apiAccount.error) {
      return Response.json({ error: apiAccount.error.message }, { status: 400 });
    }

    const parsedBalance = parseInt(apiAccount.balance ?? "0", 10);
    const normalizedBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
    const parsedStatus = parseInt(String(apiAccount.account_status ?? ""), 10);
    const normalizedStatus = Number.isFinite(parsedStatus) ? parsedStatus : null;
    const isZeroBalance = normalizedBalance === 0;

    // Update DB
    try {
      await prisma.adAccount.update({
        where: { id: accountId },
        data: {
          balance: normalizedBalance,
          currency: apiAccount.currency || "USD",
          accountStatus: normalizedStatus ?? undefined,
          paidVerified: isZeroBalance,
        },
      });
    } catch {
      // Account may not be in DB yet — ignore
    }

    return Response.json({
      balance: normalizedBalance,
      currency: apiAccount.currency,
      status: normalizedStatus,
      paidVerified: isZeroBalance,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
