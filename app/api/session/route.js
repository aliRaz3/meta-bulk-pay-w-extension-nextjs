import { prisma } from "@/lib/prisma";

// GET /api/session?sessionId=xxx  — verify session exists
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    return Response.json({ session });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/session  — upsert latest session for userId+appId, return sessionId
export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, userName, token, appId } = body;
    if (!userId || !token || !appId) {
      return Response.json({ error: "userId, token, appId required" }, { status: 400 });
    }

    // Capture IP and User-Agent for audit logging
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const userAgent = request.headers.get("user-agent") || null;

    const loginAt = new Date();

    // Upsert: one record per userId+appId combination, always up-to-date
    // lastLoginAt is set on creation (when profile is first attached) and refreshed each login
    const session = await prisma.session.upsert({
      where: { userId_appId: { userId, appId } },
      update: { userName: userName || "", token, ip, userAgent, lastLoginAt: loginAt, updatedAt: loginAt },
      create: { id: crypto.randomUUID(), userId, userName: userName || "", token, appId, ip, userAgent, lastLoginAt: loginAt, updatedAt: loginAt },
    });

    return Response.json({ session });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
