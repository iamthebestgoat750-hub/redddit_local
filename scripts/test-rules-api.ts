/**
 * Quick test: shadow DOM piercing on subreddit sidebar
 * Run: npx tsx scripts/test-rules-api.ts
 */
import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as path from "path";
import { getPlaywrightProxy } from "../src/lib/proxy-config";

dotenv.config({ path: path.join(process.cwd(), ".env") });
const SUBS = ["NoStupidQuestions", "Advice", "NewToReddit"];

async function run() {
    const proxy = getPlaywrightProxy();
    const browser = await chromium.launch({ headless: true, proxy: proxy ?? undefined });
    const page = await browser.newPage();

    for (const sub of SUBS) {
        try {
            console.log(`\n📌 r/${sub}...`);
            await page.goto(`https://www.reddit.com/r/${sub}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(4000);

            // Check if widget exists
            const widgetCount = await page.locator('shreddit-community-rules-widget').count();
            console.log(`   Widget count: ${widgetCount}`);

            if (widgetCount > 0) {
                const text = await page.locator('shreddit-community-rules-widget').innerText({ timeout: 5000 });
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10 && !/^[0-9]+$/.test(l));
                console.log(`   ✅ ${lines.length} rule lines:`);
                lines.slice(0, 5).forEach(l => console.log(`      - ${l.slice(0, 80)}`));
            } else {
                console.log(`   ⚠️ No shreddit-community-rules-widget found`);
                // Check what elements are present
                const h3s = await page.locator('h3').allTextContents();
                const rulesH3 = h3s.filter(t => t.toLowerCase().includes('rule'));
                console.log(`   h3s with 'rule': ${JSON.stringify(rulesH3)}`);
            }
        } catch (e) {
            console.log(`   ❌ Error: ${e}`);
        }
    }
    await browser.close();
    console.log("\n✅ Test done.");
}
run().catch(console.error);
