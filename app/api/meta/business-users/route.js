import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v25.0";

async function fetchWithRetry(url, options, retries = 3) {
  let delay = 600;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("Unexpected retry state");
}

export async function POST(request) {
  try {
    const { sessionId, businesses } = await request.json();
    if (!sessionId || !businesses || businesses.length === 0) {
      return Response.json({ error: "sessionId and businesses required" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const token = session.token;

    const results = await Promise.allSettled(
      businesses.map(async (bm) => {
        const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${bm.bmId}`);
        url.searchParams.set("fields", "business_users");
        url.searchParams.set("access_token", token);

        const response = await fetchWithRetry(url.toString(), { method: "GET" });

        if (!response.ok) {
          let jsonResponse = null;
          try { jsonResponse = await response.json(); } catch { }
          throw new Error(
            `HTTP ${response.status} (${jsonResponse?.error?.code ?? "unknown"}): ${jsonResponse?.error?.message || "Unknown error"}`
          );
        }

        const data = await response.json();
        const users = (data?.business_users?.data || []).map((u) => ({
          id: u.id,
          name: u.name || u.id,
          role: u.role || "USER",
        }));
        return { bmId: bm.bmId, users };
      })
    );

    const usersByBm = {};
    const selectedByBm = {};
    const loadErrors = [];

    results.forEach((result, i) => {
      const bm = businesses[i];
      if (result.status === "fulfilled") {
        const users = result.value.users || [];
        usersByBm[bm.bmId] = users;
        if (users.length > 0) {
          selectedByBm[bm.bmId] = users[0].id;
        } else {
          loadErrors.push(`No users found for ${bm.bmName}.`);
        }
      } else {
        usersByBm[bm.bmId] = [];
        loadErrors.push(`Failed to load users for ${bm.bmName}: ${result.reason?.message || "Unknown error"}`);
      }
    });

    return Response.json({ usersByBm, selectedByBm, loadErrors });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
