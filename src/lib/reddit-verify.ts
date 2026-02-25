import { chromium, BrowserContext, Page, Cookie } from "playwright";
import { prisma } from "./db";
import { fetchRedditProfileStats } from "./reddit-actions";
import { getTempSessionPath } from "./session-manager";

export interface VerificationResult {
    success: boolean;
    error?: string;
    username?: string;
    karma?: number;
    accountAge?: number;
    cookies?: Cookie[]; // Return cookies so API can save them to DB
}


export async function verifyRedditCredentials(username: string, password: string, headless: boolean = true, accountId?: string): Promise<VerificationResult> {
    let context: BrowserContext | undefined;
    let step = "init";

    // Use temp path (ephemeral)
    const sessionPath = getTempSessionPath(username);

    const logs: string[] = [];
    const addLog = async (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const fullMsg = `${timestamp}: ${msg}`;
        console.log(`[VERIFY][${timestamp}] ${msg}`);
        logs.push(fullMsg);

        if (accountId) {
            try {
                await prisma.redditAccount.update({
                    where: { id: accountId },
                    data: { lastDebugLogs: JSON.stringify(logs.slice(-50)) }
                });
            } catch (e) { }
        }
    };

    const captureScreenshot = async (page: Page) => {
        if (!accountId) return;
        try {
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
            const base64 = `data:image/jpeg;base64,${screenshot.toString('base64')}`;
            await prisma.redditAccount.update({
                where: { id: accountId },
                data: { lastDebugScreenshot: base64 }
            });
        } catch (e) { }
    };

    try {
        await addLog(`Starting verification for ${username} (Headless: ${headless})`);
        step = "launch";

        const proxyUrl = process.env.PROXY_URL;
        let proxyConfig = undefined;

        if (proxyUrl) {
            try {
                const url = new URL(proxyUrl);
                proxyConfig = {
                    server: `${url.protocol}//${url.host}`,
                    username: url.username || undefined,
                    password: url.password || undefined,
                };
                console.log(`[PROXY] Configured: ${proxyConfig.server} (Auth: ${!!proxyConfig.username})`);
            } catch (e) {
                console.error(`[PROXY] Invalid URL format: ${proxyUrl}`);
            }
        }

        context = await chromium.launchPersistentContext(sessionPath, {
            headless: headless,
            slowMo: 50,
            proxy: proxyConfig,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions'
            ],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 }
        });

        const page = context.pages()[0] || await context.newPage();

        // Detect and log current IP to verify proxy
        try {
            const ipData = await page.goto('https://api.ipify.org?format=json', { timeout: 15000 }).then(r => r?.json()).catch(() => null);
            if (ipData && (ipData as any).ip) {
                await addLog(`🌍 Browser Source IP: ${(ipData as any).ip}`);
            } else {
                await addLog('⚠️ Could not detect IP via ipify.');
            }
        } catch (e) {
            await addLog('⚠️ IP detection failed (timeout or block).');
        }
        await captureScreenshot(page);

        async function verifySession(expectedUser: string): Promise<{ success: boolean; name?: string }> {
            try {
                await page.waitForTimeout(2000);
                const apiData = await page.evaluate(async () => {
                    try {
                        const res = await fetch('https://www.reddit.com/api/me.json', { credentials: 'include' });
                        if (res.ok) {
                            const json = await res.json();
                            return json.data;
                        }
                    } catch { }
                    return null;
                });
                if (apiData && apiData.name) {
                    const actualName = apiData.name.toLowerCase();
                    const expected = expectedUser.toLowerCase();
                    if (username.includes('@') || actualName === expected) {
                        return { success: true, name: apiData.name };
                    }
                }
            } catch { }
            return { success: false };
        }

        // ENHANCED STEALTH: Mock more browser properties
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            (window as any).chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions.query;
            (window.navigator.permissions as any).query = (parameters: any) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        step = "check_session";
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            console.warn(`[DEBUG] Initial load timeout for session check, proceeding with Race...`);
        }

        const isDetected = await Promise.race([
            page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"], [aria-label*="User menu"]', { timeout: 15000 }).then(() => true),
            page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', { timeout: 15000 }).then(() => false)
        ]).catch(() => false);

        if (isDetected) {
            const v = await verifySession(username);
            if (v.success) {
                await addLog(`✅ Already logged in via persistent session for ${v.name}`);
                const cookies = await context.cookies();
                return { success: true, username: v.name, cookies };
            }
        }

        // 1. Navigate to Login
        step = "navigate";
        await addLog("Navigating to login page...");
        try {
            await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e: any) {
            await addLog("❌ Navigation timeout. Network might be slow.");
            await captureScreenshot(page);
            return { success: false, error: `Could not reach Reddit login page. (Network error)` };
        }
        await page.waitForTimeout(1000 + Math.floor(Math.random() * 1000));
        await captureScreenshot(page);

        // 2. Fill credentials
        step = "fill";
        await addLog("Filling credentials...");
        try {
            const userSelector = 'input[name="username"], #login-username, [placeholder*="username"]';
            const passSelector = 'input[name="password"], #login-password, [placeholder*="Password"]';
            await page.waitForSelector(userSelector, { timeout: 10000 });
            await page.click(userSelector);
            await page.keyboard.type(username, { delay: 120 });
            await page.waitForTimeout(500 + Math.floor(Math.random() * 500));
            await page.click(passSelector);
            await page.keyboard.type(password.toString(), { delay: 120 });
            await page.waitForTimeout(800 + Math.floor(Math.random() * 1200));
        } catch (e: any) {
            await addLog(`❌ Form fill failed: ${e.message}`);
            await captureScreenshot(page);
            return { success: false, error: "Reddit login form not found. Please try again." };
        }

        // 3. Submit
        step = "submit";
        await addLog("Submitting login form...");
        await captureScreenshot(page);
        await page.keyboard.press('Enter');

        // 4. Wait for result (45s max, using proper race)
        step = "wait-result";
        await addLog("Waiting for login result (checking for redirect or errors)...");
        try {
            const result = await Promise.race([
                page.waitForURL(
                    (url) => url.toString().includes("reddit.com") && !url.toString().includes("/login") && !url.toString().includes("/register"),
                    { timeout: 45000 }
                ).then(() => "success"),
                page.waitForSelector(
                    '[role="alert"], .AnimatedForm__errorMessage, :text("Incorrect username"), :text("Something went wrong"), :text("wrong password")',
                    { timeout: 45000 }
                ).then(() => "error"),
                page.waitForSelector(
                    'iframe[title="reCAPTCHA"], iframe[src*="recaptcha"]',
                    { timeout: 45000 }
                ).then(() => "captcha"),
            ]).catch(() => "timeout");

            await addLog(`Login result: ${result}`);
            await captureScreenshot(page);

            if (result === "error") {
                const errorText = await page.locator('[role="alert"], .AnimatedForm__errorMessage').first().innerText().catch(() => "Invalid username or password");
                return { success: false, error: errorText };
            }
            if (result === "captcha") {
                await addLog("🚨 CAPTCHA detected! Reddit is blocking the server IP.");
                return { success: false, error: "CAPTCHA detected. Reddit is blocking this connection." };
            }
            if (result === "timeout") {
                return { success: false, error: "Login timed out (45s). Please try again." };
            }

            const v = await verifySession(username);

            if (result === "success" || v.success) {
                if (page.url().includes("/login")) {
                    await addLog("⚠️ Flow stuck on login page.");
                    return { success: false, error: "Login flow incomplete. Still on login page." };
                }

                let finalUsername = v.name || username;

                if (!v.success && !username.includes('@')) {
                    await addLog("❌ API verification failed after login.");
                    return { success: false, error: "API verification failed after login." };
                }

                if (username.includes("@") && !v.name) {
                    await addLog("Detecting real username via /user/me...");
                    try {
                        await page.goto("https://www.reddit.com/user/me", { waitUntil: 'domcontentloaded' });
                        const url = page.url();
                        if (url.includes("/user/")) {
                            finalUsername = url.split("/user/")[1].split("/")[0];
                            await addLog(`Found username: @${finalUsername}`);
                        }
                    } catch (e) {
                        await addLog("Failed to fetch username from /user/me");
                    }
                }

                await addLog("Fetching profile karma and age...");
                const stats = await fetchRedditProfileStats(page).catch(() => null);
                const cookies = await context.cookies();
                await addLog("✅ Verification successful!");

                return {
                    success: true,
                    username: finalUsername,
                    karma: stats?.karma || 0,
                    accountAge: stats?.ageDays || 0,
                    cookies: cookies
                };
            }

            return { success: false, error: "Login failed or timed out. Please try Visible Mode." };

        } catch (e: any) {
            console.error(`[DEBUG] Error during result waiting: ${e.message}`);
            return { success: false, error: "Verification timed out. Reddit is not responding." };
        }

    } catch (error: any) {
        await addLog(`❌ Playwright error at step [${step}]: ${error.message}`);
        return { success: false, error: `Verification System Error: [${step}] ${error.message || "Unknown error"}` };
    } finally {
        if (context) await context.close();
    }
}
