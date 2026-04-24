import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

const PAGE_SIZE = 25;
const SORTABLE = ["name", "accountStatus", "balance", "currency", "createdAt", "updatedAt"];

export async function GET(request, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bmId } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const search = searchParams.get("search")?.trim() || "";
  const sortBy = SORTABLE.includes(searchParams.get("sortBy")) ? searchParams.get("sortBy") : "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const skip = (page - 1) * PAGE_SIZE;

  const business = await prisma.business.findUnique({
    where: { id: bmId },
    select: {
      id: true,
      name: true,
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

  const where = {
    bmId,
    ...(search
      ? {
        OR: [
          { name: { contains: search } },
          { id: { contains: search } },
        ],
      }
      : {}),
  };

  const [total, adAccounts] = await Promise.all([
    prisma.adAccount.count({ where }),
    prisma.adAccount.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { [sortBy]: sortDir },
      select: {
        id: true,
        name: true,
        accountStatus: true,
        currency: true,
        balance: true,
        disableReason: true,
        bmId: true,
        bmName: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ business, adAccounts, total, page, pageSize: PAGE_SIZE });
}
