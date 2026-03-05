import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function run() {
    const result = await p.redditAccount.deleteMany({});
    console.log(`✅ Deleted ${result.count} account(s) from DB.`);
    await p.$disconnect();
}
run();
