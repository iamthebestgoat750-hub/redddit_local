import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { fetchPublicRedditStats } from "@/lib/reddit-public";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const redditAccount = await prisma.redditAccount.findUnique({
            where: { id },
            include: { project: true }
        });

        if (!redditAccount || redditAccount.project.userId !== (session.user as any).id) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }

        const username = redditAccount.username;

        // ⚡ Fast path: Use public Reddit API (no browser, no login, ~1 second)
        console.log(`[REFRESH] Fetching public stats for @${username}...`);
        const stats = await fetchPublicRedditStats(username);

        if (!stats) {
            return NextResponse.json({ error: "Could not fetch stats from Reddit. Account may be private or suspended." }, { status: 400 });
        }

        // Update DB
        const updated = await prisma.redditAccount.update({
            where: { id },
            data: {
                karma: stats.karma,
                accountAge: stats.ageDays,
                updatedAt: new Date(),
            },
        });

        console.log(`[REFRESH] ✅ @${username}: ${stats.karma} Karma, ${stats.ageDays} days old.`);

        return NextResponse.json({
            message: "Stats refreshed successfully",
            account: updated
        });

    } catch (error: any) {
        console.error("Refresh error:", error);
        return NextResponse.json({ error: error.message || "Failed to refresh account" }, { status: 500 });
    }
}
