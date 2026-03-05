/**
 * Quick proxy test — run with: npx tsx scripts/test-proxy.ts
 */
import { chromium } from "playwright";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const PROXY_URL = process.env.PROXY_URL || "";

function parseProxy(proxyUrl: string) {
    try {
        const url = new URL(proxyUrl);
        return {
            server: `${url.protocol}//${url.hostname}:${url.port}`,
            username: url.username || undefined,
            password: url.password || undefined,
        };
    } catch {
        return { server: proxyUrl };
    }
}

(async () => {
    console.log("\n🔍 Testing proxy connection...");
    console.log(`📡 Proxy: ${PROXY_URL || "NOT SET"}\n`);

    if (!PROXY_URL) {
        console.error("❌ PROXY_URL not set in .env!");
        process.exit(1);
    }

    const proxyConfig = parseProxy(PROXY_URL);
    console.log(`🔧 Parsed proxy server: ${proxyConfig.server}`);
    console.log(`👤 Username: ${proxyConfig.username || "none"}\n`);

    const browser = await chromium.launch({
        headless: true,
        proxy: proxyConfig,
    });

    const page = await browser.newPage();

    try {
        await page.goto("https://api.ipify.org?format=json", {
            waitUntil: "domcontentloaded",
            timeout: 20000,
        });
        const body = await page.evaluate(() => document.body.innerText);
        const { ip } = JSON.parse(body);

        console.log(`✅ Proxy is WORKING!`);
        console.log(`🌐 Reddit will see IP: ${ip}`);
        console.log(`🏠 Your real IP is HIDDEN. ✅\n`);
    } catch (err: any) {
        console.error(`❌ Proxy FAILED: ${err.message}`);
        console.log("\nPossible fixes:");
        console.log("1. Check if proxy is still active on proxy-seller dashboard");
        console.log("2. Try HTTP port instead of SOCKS5");
        console.log("3. Make sure Username/Password auth is selected (not IP whitelist)\n");
    } finally {
        await browser.close();
    }
})();
