import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function GET(_request, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bmId } = await params;

  const business = await prisma.business.findUnique({
    where: { id: bmId },
    select: {
      id: true,
      name: true,
      adAccountCount: true,
      sessionId: true,
      session: {
        select: {
          id: true,
          userId: true,
          userName: true,
          appId: true,
          ip: true,
          userAgent: true,
          token: true,
          cookies: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  return NextResponse.json({ business });
}
