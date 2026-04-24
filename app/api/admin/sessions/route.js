import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

const PAGE_SIZE = 20;
const SORTABLE = ["userName", "userId", "appId", "ip", "createdAt", "updatedAt"];

export async function GET(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const search = searchParams.get("search")?.trim() || "";
  const sortBy = SORTABLE.includes(searchParams.get("sortBy")) ? searchParams.get("sortBy") : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const skip = (page - 1) * PAGE_SIZE;

  const where = search
    ? {
      OR: [
        { userName: { contains: search } },
        { userId: { contains: search } },
        { appId: { contains: search } },
        { ip: { contains: search } },
      ],
    }
    : {};

  const [total, sessions] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { [sortBy]: sortDir },
      select: {
        id: true,
        userId: true,
        userName: true,
        appId: true,
        ip: true,
        userAgent: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { business: true, adaccount: true } },
      },
    }),
  ]);

  return NextResponse.json({ sessions, total, page, pageSize: PAGE_SIZE });
}
