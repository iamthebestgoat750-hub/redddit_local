import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// ✅ Load .env FIRST before anything else (especially before Prisma)
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[SYNC] ✅ Loaded environment from: ${envPath}`);
} else {
    console.warn("[SYNC] ⚠️ .env file not found! DATABASE_URL may be missing.");
}

import { PrismaClient } from "@prisma/client";
import { chromium, BrowserContext } from "playwright";
import { getTempSessionPath, loadCookiesFromDb } from "../src/lib/session-manager";
import { fetchRedditProfileStats } from "../src/lib/reddit-actions";
import { getPlaywrightProxy } from "../src/lib/proxy-config";

// ── Proxy check at startup ────────────────────────────────────────
async function checkProxy() {
    const proxy = getPlaywrightProxy();
    if (!proxy) {
        console.log("[PROXY] ⚠️  No proxy set — using your real IP!");
        return;
    }
    try {
        const browser = await chromium.launch({ headless: true, proxy });
        const page = await browser.newPage();
        await page.goto("https://api.ipify.org?format=json", { timeout: 15000 });
        const body = await page.evaluate(() => document.body.innerText);
        const { ip } = JSON.parse(body);
        console.log(`[PROXY] ✅ Proxy connected! Reddit will see IP: ${ip}`);
        await browser.close();
    } catch {
        console.log(`[PROXY] ❌ Proxy failed to connect — check PROXY_URL in .env`);
    }
}

async function syncAllStats() {
    // ✅ Prisma initialized INSIDE async function, after env is guaranteed loaded
    const prisma = new PrismaClient();

    console.log("-----------------------------------------");
    console.log("🚀 STARTING GLOBAL STATS SYNC...");
    console.log("-----------------------------------------");

    try {
        const accounts = await prisma.redditAccount.findMany({
            where: { status: { in: ["active", "warmup", "warmed", "ready"] } }
        });

        if (accounts.length === 0) {
            console.log("No active accounts found to sync. Starting server...");
            return;
        }

        console.log(`Found ${accounts.length} active account(s). Checking Karma & Age...\n`);

        for (const account of accounts) {
            process.stdout.write(`🔍 Syncing @${account.username}... `);

            let context: BrowserContext | undefined;
            try {
                const sessionPath = getTempSessionPath(account.username);

                context = await chromium.launchPersistentContext(sessionPath, {
                    headless: true,
                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-blink-features=AutomationControlled"
                    ],
                    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                });

                const page = context.pages()[0] || await context.newPage();

                // 1. Restore cookies from DB
                await loadCookiesFromDb(account.id, context);

                // 2. Fetch latest stats
                const stats = await fetchRedditProfileStats(page);

                if (stats) {
                    await prisma.redditAccount.update({
                        where: { id: account.id },
                        data: {
                            karma: stats.karma,
                            accountAge: stats.ageDays,
                            updatedAt: new Date()
                        }
                    });
                    process.stdout.write(`✅ Done: ${stats.karma} Karma, ${stats.ageDays} Days.\n`);
                } else {
                    process.stdout.write(`⚠️ Could not fetch profile — skipping.\n`);
                }
            } catch (err: any) {
                process.stdout.write(`❌ Error: ${err.message}\n`);
            } finally {
                if (context) await context.close();
            }
        }
    } catch (error: any) {
        console.error("\nFATAL ERROR during sync:", error.message);
    } finally {
        await prisma.$disconnect();
        console.log("\n-----------------------------------------");
        console.log("✨ STATS SYNC COMPLETED.");
        console.log("-----------------------------------------\n");
    }
}

checkProxy().then(() => syncAllStats());
