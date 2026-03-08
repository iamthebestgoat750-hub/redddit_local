import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        const account = await (prisma as any).redditAccount.findFirst({
            where: {
                id: id,
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
            screenshot: account.lastDebugScreenshot ?? null,
            logs: (() => { try { return account.lastDebugLogs ? JSON.parse(account.lastDebugLogs) : []; } catch { return []; } })(),
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch live data" }, { status: 500 });
    }
}
