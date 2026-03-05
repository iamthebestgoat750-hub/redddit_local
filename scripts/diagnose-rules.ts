/**
 * Diagnose Reddit rules page selectors — run with: npx tsx scripts/diagnose-rules.ts
 */
import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as path from "path";
import { getPlaywrightProxy } from "../src/lib/proxy-config";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const SUB = "r/NoStupidQuestions"; // known to have rules

async function run() {
    const proxyConf = getPlaywrightProxy();
    const browser = await chromium.launch({ headless: false, proxy: proxyConf ?? undefined });
    const page = await browser.newPage();

    console.log(`\n🔍 Opening ${SUB}/about/rules ...`);
    await page.goto(`https://www.reddit.com/${SUB}/about/rules`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
    });
    await page.waitForTimeout(4000);

    // Try every possible selector & log counts
    const report = await page.evaluate(() => {
        const trySelector = (sel: string) => {
            try {
                const els = document.querySelectorAll(sel);
                return { count: els.length, sample: els[0]?.textContent?.trim().slice(0, 80) ?? "" };
            } catch { return { count: 0, sample: "" }; }
        };

        return {
            "faceplate-expandable": trySelector("faceplate-expandable"),
            "shreddit-community-rules-widget": trySelector("shreddit-community-rules-widget"),
            "ol > li": trySelector("ol > li"),
            "ol li": trySelector("ol li"),
            ".community-rules-list li": trySelector(".community-rules-list li"),
            "[data-testid='community-rules'] li": trySelector("[data-testid='community-rules'] li"),
            "details": trySelector("details"),
            "summary": trySelector("summary"),
            "h2": trySelector("h2"),
            "h3": trySelector("h3"),
            // Shadow DOM check
            hasShadowHosts: document.querySelectorAll("*").length,
            pageTitle: document.title,
        };
    });

    console.log("\n📊 SELECTOR REPORT:");
    for (const [key, val] of Object.entries(report)) {
        if (typeof val === "object" && "count" in val) {
            console.log(`  ${key}: ${val.count} elements`);
            if (val.count > 0) console.log(`    Sample: "${val.sample}"`);
        } else {
            console.log(`  ${key}:`, val);
        }
    }

    // Also print raw HTML of main content
    const html = await page.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        return main.innerHTML.slice(0, 3000);
    });
    console.log("\n📄 RAW HTML (first 3000 chars):\n", html);

    await page.waitForTimeout(3000);
    await browser.close();
}

run().catch(console.error);
