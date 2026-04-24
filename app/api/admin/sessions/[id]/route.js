import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

const PAGE_SIZE = 20;
const SORTABLE = ["name", "createdAt", "updatedAt"];

export async function GET(request, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const search = searchParams.get("search")?.trim() || "";
  const sortBy = SORTABLE.includes(searchParams.get("sortBy")) ? searchParams.get("sortBy") : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const skip = (page - 1) * PAGE_SIZE;

  const session = await prisma.session.findUnique({
    where: { id },
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
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const where = {
    sessionId: id,
    ...(search ? { name: { contains: search } } : {}),
  };

  const [total, businesses] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { [sortBy]: sortDir },
      select: {
        id: true,
        name: true,
        adAccountCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ session, businesses, total, page, pageSize: PAGE_SIZE });
}
