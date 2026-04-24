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

    if (bms.length > 0) {
      const now = new Date();
      const placeholders = bms.map(() => "(?,?,?,?,?,?)").join(",");
      const values = bms.flatMap((bm) => [bm.id, bm.name, session.id, true, now, now]);
      await prisma.$executeRawUnsafe(
        `INSERT INTO business (id, name, sessionId, selected, createdAt, updatedAt)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           name      = VALUES(name),
           sessionId = VALUES(sessionId),
           updatedAt = VALUES(updatedAt)`,
        ...values
      );
    }

    return Response.json({ businesses: bms });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
