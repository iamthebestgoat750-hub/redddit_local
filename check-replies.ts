import { prisma } from "./src/lib/db";

async function verifyRedditUrl(url: string, expectedContent: string): Promise<{ live: boolean; reason?: string }> {
    if (!url || url === 'No URL') return { live: false, reason: "Missing URL" };
    try {
        const res = await fetch(url + '.json', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' }
        });
        if (!res.ok) return { live: false, reason: `HTTP ${res.status}` };

        const data = await res.json();
        // Reddit .json API returns an array for comments: [post_data, comment_data]
        const commentData = data[1]?.data?.children?.[0]?.data;

        if (!commentData) return { live: false, reason: "Comment not found in JSON" };
        if (commentData.author === "[deleted]") return { live: false, reason: "Comment deleted" };
        if (commentData.body === "[removed]") return { live: false, reason: "Comment removed (Mod/Filter)" };

        const isMatch = commentData.body.includes(expectedContent.substring(0, 20));
        return { live: isMatch, reason: isMatch ? undefined : "Content mismatch" };
    } catch (e: any) {
        return { live: false, reason: e.message };
    }
}

async function main() {
    console.log("\n🚀 --- BOT AUTHENTICITY & LIVE STATUS CHECK ---\n");

    // 1. Check for replies in Comment table
    const recentComments = await prisma.comment.findMany({
        take: 5,
        orderBy: { postedAt: 'desc' },
        include: {
            redditAccount: { select: { username: true } }
        }
    });

    console.log(`Checking Recent Comments (${recentComments.length})...`);
    let liveCount = 0;

    for (const c of recentComments) {
        const status = await verifyRedditUrl(c.redditUrl || '', c.content);
        const icon = status.live ? "✅ [LIVE]" : `❌ [MISSING: ${status.reason}]`;
        if (status.live) liveCount++;

        console.log(`- ${icon} @${c.redditAccount.username} | ${c.redditUrl}`);
        console.log(`  Content: "${c.content.substring(0, 60)}..."`);
    }

    const successRate = recentComments.length > 0 ? (liveCount / recentComments.length) * 100 : 0;
    console.log(`\n📊 Authentic Success Rate (Live/Total): ${successRate.toFixed(1)}%\n`);

    // 2. Check for replied leads
    const repliedLeads = await prisma.lead.findMany({
        where: { status: "replied" },
        take: 5,
        orderBy: { updatedAt: 'desc' }
    });

    console.log(`Recently Replied Leads (${repliedLeads.length}):`);
    repliedLeads.forEach(l => {
        console.log(`- [${l.updatedAt.toISOString()}] ${l.title.substring(0, 50)}... | Sub: r/${l.subreddit}`);
    });

    console.log("\nTip: Agar success rate kam hai, to account warmup ki zarurat hai ya proxies check karein.");
    process.exit(0);
}

main();
