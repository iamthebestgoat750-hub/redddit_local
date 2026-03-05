/**
 * Test rules scraping with actual account cookies.
 * Run: npx tsx scripts/test-rules-final.ts
 */
import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as path from "path";
import { prisma } from "../src/lib/db";
import { getPlaywrightProxy } from "../src/lib/proxy-config";
import { scrapeSubredditRules } from "../src/lib/reddit-actions";
import { loadCookiesFromDb } from "../src/lib/session-manager";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ACCOUNT_ID = "cmmb66k540001v6fs8m8thqxn"; // MusicianWorldly9068
const SUBS = ["NoStupidQuestions", "Advice", "NewToReddit", "AmazingStories"];

async function run() {
    const proxy = getPlaywrightProxy();
    const browser = await chromium.launch({ headless: true, proxy: proxy ?? undefined });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`\n🔐 Loading cookies for account ${ACCOUNT_ID}...`);
    const acc = await prisma.redditAccount.findUnique({ where: { id: ACCOUNT_ID } });
    if (!acc) throw new Error("Account not found");

    if (acc.browserCookies) {
        const cookies = JSON.parse(acc.browserCookies);
        await context.addCookies(cookies);
        console.log(`✅ Loaded ${cookies.length} cookies.`);
    } else {
        console.log("⚠️ No cookies found in DB, test may fail.");
    }

    for (const sub of SUBS) {
        try {
            console.log(`\n📌 Testing rules scraping for r/${sub}...`);
            const rules = await scrapeSubredditRules(page, sub);

            // Diagnostic capture
            const screenshotPath = `rules-diag-${sub}.png`;
            await page.screenshot({ path: screenshotPath });
            console.log(`📸 Diagnostic screenshot saved: ${screenshotPath}`);
            const html = await page.content();
            console.log(`📄 Page title: ${await page.title()}`);
            console.log(`📄 Page content snippet (first 500 chars): ${html.slice(0, 500)}`);

            console.log("-----------------------------------------");
            console.log(rules);
            console.log("-----------------------------------------");
        } catch (e) {
            console.log(`❌ Error for r/${sub}:`, e);
        }
    }

    await browser.close();
    console.log("\n✅ Test complete.");
}

run().catch(console.error);
