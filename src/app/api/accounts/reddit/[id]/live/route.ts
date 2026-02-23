import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const account = await prisma.redditAccount.findUnique({
            where: {
                id: params.id,
                project: { userId: (session.user as any).id }
            },
            select: {
                lastDebugScreenshot: true,
                lastDebugLogs: true,
            }
        });

        if (!account) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }

        return NextResponse.json({
            screenshot: account.lastDebugScreenshot,
            logs: account.lastDebugLogs ? JSON.parse(account.lastDebugLogs) : [],
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch live data" }, { status: 500 });
    }
}
