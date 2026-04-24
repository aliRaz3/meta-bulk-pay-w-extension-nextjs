import { prisma } from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }
  try {
    const session = await prisma.session.findUnique({ where: { userId } });
    return Response.json({ session });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, userName, token, appId } = body;
    if (!userId || !token || !appId) {
      return Response.json({ error: "userId, token, appId required" }, { status: 400 });
    }
    const session = await prisma.session.upsert({
      where: { userId },
      update: { userName: userName || "", token, appId, updatedAt: new Date() },
      create: { userId, userName: userName || "", token, appId },
    });
    return Response.json({ session });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }
  try {
    await prisma.session.deleteMany({ where: { userId } });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
