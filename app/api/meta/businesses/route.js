import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v25.0";

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

export async function POST(request) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const bms = await graphGetAll("me/businesses", session.token, { fields: "id,name" });

    // Upsert each BM under this session
    const now = new Date();
    for (const bm of bms) {
      await prisma.business.upsert({
        where: { id: bm.id },
        update: { name: bm.name, sessionId: session.id, updatedAt: now },
        create: { id: bm.id, name: bm.name, sessionId: session.id, selected: true, updatedAt: now },
      });
    }

    return Response.json({ businesses: bms });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
