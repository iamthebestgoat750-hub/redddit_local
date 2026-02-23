import { chromium, BrowserContext, Page, Cookie } from "playwright";
import { fetchRedditProfileStats } from "./reddit-actions";
import { getTempSessionPath } from "./session-manager";
import { prisma } from "@/lib/db";

export interface VerificationResult {
    success: boolean;
    error?: string;
    username?: string;
    karma?: number;
    accountAge?: number;
    cookies?: Cookie[];
}

// Save screenshot to DB for dashboard Live View
async function saveScreenshotToDb(accountId: string, page: Page) {
    try {
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
        const base64 = `data:image/jpeg;base64,${screenshot.toString('base64')}`;
        await (prisma as any).redditAccount.update({
            where: { id: accountId },
            data: { lastDebugScreenshot: base64 }
        });
    } catch (e) { }
}

async function saveLogToDb(accountId: string, msg: string) {
    try {
        const acc = await (prisma as any).redditAccount.findUnique({
            where: { id: accountId },
            select: { lastDebugLogs: true }
        });
        const existing: string[] = acc?.lastDebugLogs ? JSON.parse(acc.lastDebugLogs) : [];
        const timestamp = new Date().toLocaleTimeString();
        existing.push(`${timestamp}: ${msg}`);
        await (prisma as any).redditAccount.update({
            where: { id: accountId },
            data: { lastDebugLogs: JSON.stringify(existing.slice(-50)) }
        });
    } catch (e) { }
}
export async function verifyRedditCredentials(username: string, password: string, headless: boolean = true, accountId?: string): Promise<VerificationResult> {
    let context: BrowserContext | undefined;
    let step = "init";

    // Use temp path (ephemeral)
    const sessionPath = getTempSessionPath(username);

    try {
        console.log(`[DEBUG] Starting verification for ${username} (Headless: ${headless})`);
        step = "launch";

        context = await chromium.launchPersistentContext(sessionPath, {
            headless: headless,
            slowMo: 50,
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
        console.log(`[DEBUG] Navigating to reddit.com for session check...`);
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            console.warn(`[DEBUG] Initial load timeout, proceeding...`);
        }

        if (accountId) {
            await saveScreenshotToDb(accountId, page);
            await saveLogToDb(accountId, "📸 Step 1: Opened reddit.com - checking session...");
        }

        const isDetected = await Promise.race([
            page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"], [aria-label*="User menu"]', { timeout: 15000 }).then(() => true),
            page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', { timeout: 15000 }).then(() => false)
        ]).catch(() => false);

        if (isDetected) {
            const v = await verifySession(username);
            if (v.success) {
                console.log(`[DEBUG] Already logged in via persistent session for ${v.name}`);
                if (accountId) await saveLogToDb(accountId, `✅ Already logged in as @${v.name}`);
                const cookies = await context.cookies();
                return { success: true, username: v.name, cookies };
            }
        }

        // Step 2: Click "Log In" button on the homepage navbar
        step = "navigate";
        console.log(`[DEBUG] Clicking Log In button on homepage...`);
        try {
            const loginBtn = await page.waitForSelector(
                'a[href*="/login"], a:has-text("Log In"), button:has-text("Log In"), #login-link',
                { timeout: 10000 }
            );
            await loginBtn!.click();
            console.log(`[DEBUG] Clicked Log In button - waiting for login page...`);
            await page.waitForURL(/login/, { timeout: 15000 }).catch(() => { });
        } catch {
            // Fallback: navigate directly to /login
            console.warn(`[DEBUG] Login button not found on homepage, navigating directly to /login...`);
            try {
                await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e: any) {
                return { success: false, error: `Could not reach Reddit login page. (Network error)` };
            }
        }

        if (accountId) {
            await saveScreenshotToDb(accountId, page);
            await saveLogToDb(accountId, "📸 Step 2: Login page opened - filling credentials...");
        }

        // Step 3: Fill credentials
        step = "fill";
        console.log(`[DEBUG] Filling credentials...`);
        try {
            const userSelector = 'input[name="username"], #login-username, [placeholder*="username"]';
            const passSelector = 'input[name="password"], #login-password, [placeholder*="Password"]';

            await page.waitForSelector(userSelector, { timeout: 10000 });
            await page.click(userSelector);
            await page.keyboard.type(username, { delay: 150 });

            await page.click(passSelector);
            await page.keyboard.type(password.toString(), { delay: 150 });

            if (accountId) {
                await saveScreenshotToDb(accountId, page);
                await saveLogToDb(accountId, "📸 Step 3: Credentials filled - submitting...");
            }
        } catch (e: any) {
            console.error(`[DEBUG] Form detection/fill failed: ${e.message}`);
            return { success: false, error: "Reddit login form interaction failed. Please try again." };
        }

        // 3. Submit
        step = "submit";
        console.log(`[DEBUG] Clicking login...`);
        await page.click('button[type="submit"], button:has-text("Log In")');

        // 4. Wait for response or error — parallel detection with short timeout
        step = "wait-result";
        try {
            console.log(`[DEBUG] Waiting for login result...`);

            const result = await Promise.race([
                // Success: navigated away from login page
                page.waitForURL(
                    (url) => url.toString().includes("reddit.com") && !url.toString().includes("login") && !url.toString().includes("register"),
                    { timeout: 30000 }
                ).then(() => "success"),

                // Wrong credentials
                page.waitForSelector(
                    '[role="alert"], .AnimatedForm__errorMessage, :text("Incorrect username"), :text("Invalid username")',
                    { timeout: 30000 }
                ).then(() => "error"),

                // CAPTCHA detected
                page.waitForSelector(
                    'iframe[title="reCAPTCHA"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha',
                    { timeout: 30000 }
                ).then(() => "captcha"),
            ]).catch(() => "timeout");

            console.log(`[DEBUG] Result detected: ${result}`);

            if (result === "captcha") {
                return {
                    success: false,
                    error: "❌ CAPTCHA detected on Railway server IP. Reddit is blocking automated logins from this server. Please try again later or use a different network."
                };
            }

            if (result === "timeout") {
                return {
                    success: false,
                    error: "❌ Login timed out (30s). Reddit may be showing a CAPTCHA or is slow. Check Railway logs for [DEBUG] messages."
                };
            }

            if (result === "error") {
                const errorText = await page.locator('[role="alert"], .AnimatedForm__errorMessage').first().innerText().catch(() => "Invalid username or password");
                return { success: false, error: errorText };
            }

            // result === "success"
            const v = await verifySession(username);

            let finalUsername = v.name || username;

            if (username.includes("@") && !v.name) {
                console.log("[DEBUG] Email used - fetching username via /user/me...");
                try {
                    await page.goto("https://www.reddit.com/user/me", { waitUntil: 'domcontentloaded' });
                    const url = page.url();
                    if (url.includes("/user/")) {
                        finalUsername = url.split("/user/")[1].split("/")[0];
                        console.log(`[DEBUG] Detected username: ${finalUsername}`);
                    }
                } catch (e) {
                    console.error("[DEBUG] Failed to fetch username from /user/me");
                }
            }

            const stats = await fetchRedditProfileStats(page).catch(() => null);
            const cookies = await context.cookies();

            return {
                success: true,
                username: finalUsername,
                karma: stats?.karma || 0,
                accountAge: stats?.ageDays || 0,
                cookies: cookies
            };

        } catch (e: any) {
            console.error(`[DEBUG] Error during result waiting: ${e.message}`);
            return { success: false, error: "Verification timed out. Reddit is not responding." };
        }

    } catch (error: any) {
        console.error(`[DEBUG] Playwright error at step [${step}]:`, error);
        return { success: false, error: `Verification System Error: [${step}] ${error.message || "Unknown error"}` };
    } finally {
        if (context) await context.close();
    }
}
