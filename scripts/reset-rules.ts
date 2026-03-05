import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
    const r = await p.subreddit.updateMany({ data: { rules: null, lastScraped: null } });
    console.log(`✅ Reset ${r.count} subreddits — rules will re-scrape fresh next warmup.`);
    await p.$disconnect();
}
run();
