import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function run() {
    const subs = await p.subreddit.findMany();
    for (const s of subs) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📌 r/${s.name}`);
        console.log(`Last Scraped: ${s.lastScraped ?? 'Never'}`);
        console.log(`Rules:\n${s.rules ?? 'NONE'}`);
    }
    await p.$disconnect();
}
run();
