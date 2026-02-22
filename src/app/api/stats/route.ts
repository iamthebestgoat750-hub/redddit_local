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
        const userId = (session.user as any).id;

        // 1. Fetch Accounts for this user
        const accounts = await prisma.redditAccount.findMany({
            where: { project: { userId } },
            select: { id: true, username: true, karma: true, status: true }
        });

        // 2. Fetch Recent Activity (comments)
        const recentActivity = await prisma.comment.findMany({
            where: { redditAccount: { project: { userId } } },
            orderBy: { postedAt: 'desc' },
            take: 10,
            include: { redditAccount: { select: { username: true } } }
        });

        // 3. Aggregate Stats
        const totalKarma = accounts.reduce((sum, acc) => sum + (acc.karma || 0), 0);
        const activeAccountsCount = accounts.filter(a => a.status === 'active' || a.status === 'ready').length;

        // 4. Counts for replies
        const totalReplies = await prisma.comment.count({
            where: { redditAccount: { project: { userId } } }
        });

        // 5. Chart Data: Karma Growth (Mocking time-series for now as we don't store historical karma snapshots yet)
        // In a real app, you'd have a KarmaSnapshot model.
        const karmaChart = [
            { name: 'Mon', karma: Math.max(0, totalKarma - 500) },
            { name: 'Tue', karma: Math.max(0, totalKarma - 400) },
            { name: 'Wed', karma: Math.max(0, totalKarma - 350) },
            { name: 'Thu', karma: Math.max(0, totalKarma - 200) },
            { name: 'Fri', karma: Math.max(0, totalKarma - 100) },
            { name: 'Sat', karma: Math.max(0, totalKarma - 50) },
            { name: 'Sun', karma: totalKarma },
        ];

        // 6. Chart Data: Engagement by Subreddit
        const subredditAggregation = await prisma.lead.groupBy({
            by: ['subreddit'],
            _count: {
                _all: true
            },
            where: {
                project: {
                    userId
                }
            },
            orderBy: {
                _count: {
                    subreddit: 'desc'
                }
            },
            take: 5
        });

        const engagementChart = subredditAggregation.map(item => ({
            name: `r/${item.subreddit}`,
            replies: item._count._all, // Using leads count as a proxy for activity
            posts: 0 // We don't have separate post counts yet in this aggregation
        }));

        // Fill with mock data if no real data yet to keep UI pretty
        if (engagementChart.length === 0) {
            engagementChart.push(
                { name: 'r/SaaS', replies: 0, posts: 0 },
                { name: 'r/Entrepreneur', replies: 0, posts: 0 }
            );
        }

        return NextResponse.json({
            accounts,
            totalKarma,
            activeAccountsCount,
            totalReplies,
            recentActivity,
            karmaChart,
            engagementChart
        });
    } catch (error) {
        console.error("Stats API Error:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
