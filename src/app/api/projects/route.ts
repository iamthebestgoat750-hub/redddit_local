import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Use raw SQL to bypass Prisma Client's field filtering if it is outdated
        const projects = await prisma.$queryRaw`
            SELECT * FROM Project WHERE userId = ${(session.user as any).id}
        `;
        return NextResponse.json({ projects });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }
}
