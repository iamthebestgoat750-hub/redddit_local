import { BrowserContext, Page, Cookie } from "playwright";
import { launchStealthContext } from "@/lib/stealth-browser";
import { fetchRedditProfileStats } from "./reddit-actions";
import { getTempSessionPath } from "./session-manager";
import { prisma } from "@/lib/db";
import { getPlaywrightProxy } from "./proxy-config";

export interface VerificationResult {
    success: boolean;
    error?: string;
    username?: string;
    karma?: number;
    accountAge?: number;
    cookies?: Cookie[];
}

// Human-like random delay
const humanDelay = (min = 1000, max = 3000) =>
    new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

// Random mouse zig-zag
async function humanMove(page: Page) {
    const { width, height } = page.viewportSize() || { width: 1280, height: 720 };
    for (let i = 0; i < 3; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    }
}

// Human-like random typing (random delay between each char)
async function humanType(page: Page, selector: string, text: string) {
    await page.click(selector);
    await humanDelay(300, 600);
    for (const char of text) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 150) + 60 });
        if (Math.random() > 0.9) await humanDelay(200, 400); // Random pause while typing
    }
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

    const sessionPath = getTempSessionPath(username);

    // Random realistic viewport
    const viewports = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];

    // Rotate user agents
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    ];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        console.log(`[DEBUG] Starting verification for ${username} (Headless: ${headless})`);
        step = "launch";

        context = await launchStealthContext(sessionPath, {
            headless: headless,
            slowMo: 0,
            proxy: getPlaywrightProxy() ?? undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--disable-plugins-discovery',
                '--disable-web-security',
                '--allow-running-insecure-content',
                `--window-size=${viewport.width},${viewport.height}`,
            ],
            userAgent,
            viewport,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            geolocation: { longitude: -74.006, latitude: 40.7128 },
            permissions: ['geolocation'],
        });

        const page = context.pages()[0] || await context.newPage();

        // MAXIMUM STEALTH: Comprehensive fingerprint hiding
        await page.addInitScript(() => {
            // Hide webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // Add realistic chrome object
            (window as any).chrome = {
                app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
                runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
                loadTimes: function () { },
                csi: function () { },
            };

            // Permissions override
            const originalQuery = window.navigator.permissions.query;
            (window.navigator.permissions as any).query = (parameters: any) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);

            // Realistic plugins array
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const arr: any = [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
                    ];
                    arr.item = (i: number) => arr[i];
                    arr.namedItem = (name: string) => arr.find((p: any) => p.name === name);
                    arr.refresh = () => { };
                    return arr;
                }
            });

            // Languages
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

            // Realistic screen size
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

            // Hide automation in iframe
            const iframeProto = HTMLIFrameElement.prototype;
            const origSrc = Object.getOwnPropertyDescriptor(iframeProto, 'contentWindow');
            Object.defineProperty(iframeProto, 'contentWindow', {
                get: function () {
                    const win = origSrc?.get?.call(this);
                    if (win) {
                        try { Object.defineProperty(win.navigator, 'webdriver', { get: () => undefined }); } catch (e) { }
                    }
                    return win;
                }
            });
        });

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

        // Step 1: Check existing session on reddit.com
        step = "check_session";
        console.log(`[DEBUG] Navigating to reddit.com...`);
        if (accountId) await saveLogToDb(accountId, "🌐 Step 1: Opening reddit.com...");

        try {
            await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            console.warn(`[DEBUG] Initial load timeout, proceeding...`);
        }

        await humanDelay(1000, 2000); // Human pause after page load

        if (accountId) {
            await saveScreenshotToDb(accountId, page);
            await saveLogToDb(accountId, "📸 Step 1: Opened reddit.com - checking session...");
        }

        const isLoggedIn = await Promise.race([
            page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, [aria-label*="User menu"]', { timeout: 8000 }).then(() => true),
            page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', { timeout: 8000 }).then(() => false)
        ]).catch(() => false);

        if (isLoggedIn) {
            const v = await verifySession(username);
            if (v.success) {
                if (accountId) await saveLogToDb(accountId, `✅ Already logged in as @${v.name}`);
                const cookies = await context.cookies();
                return { success: true, username: v.name, cookies };
            }
        }

        // Step 2: Stay on www.reddit.com and click the Login button
        // (Direct navigation to login URLs is blocked by some proxies)
        step = "navigate";
        console.log(`[DEBUG] Looking for Login button on reddit.com...`);
        if (accountId) await saveLogToDb(accountId, "🔐 Step 2: Looking for Login button on reddit.com...");

        try {
            // Make sure we are on reddit.com (already should be from Step 1)
            const currentUrl = page.url();
            if (!currentUrl.includes('reddit.com')) {
                await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
            }

            // Click the Login button on the homepage
            const loginBtn = await page.waitForSelector(
                'a[href*="/login"], a:has-text("Log In"), button:has-text("Log In"), #login-button, [data-testid="login-button"]',
                { timeout: 15000 }
            );
            if (loginBtn) {
                await loginBtn.click();
                await page.waitForTimeout(3000);
                console.log(`[DEBUG] Clicked login button, current URL: ${page.url()}`);
            }
        } catch {
            // If no button found, try navigating to login (last resort)
            try {
                await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded', timeout: 45000 });
            } catch (e: any) {
                return { success: false, error: `Could not reach Reddit login page.` };
            }
        }

        await humanDelay(800, 1500);

        if (accountId) {
            await saveScreenshotToDb(accountId, page);
            await saveLogToDb(accountId, "📸 Step 2: Login page loaded - filling credentials...");
        }


        // Step 3: Fill credentials on old.reddit.com  
        step = "fill";
        console.log(`[DEBUG] Filling credentials...`);
        await humanMove(page); // Move mouse randomly before starting

        try {
            // Check if we are actually on old.reddit or redirected to new UI
            const isOldUI = await page.$('#user_login').then(el => !!el);

            if (isOldUI) {
                const userSelector = '#user_login';
                const passSelector = '#passwd_login';

                await page.waitForSelector(userSelector, { timeout: 5000 });
                await humanDelay(500, 1000);
                await humanType(page, userSelector, username);

                await humanDelay(600, 1200);
                await humanMove(page);
                await humanType(page, passSelector, password.toString());
            } else {
                // We are on the new UI (redirected)
                console.log(`[DEBUG] Redirected to new UI, adapting selectors...`);
                const userSelector = 'input[name="username"], #login-username';
                const passSelector = 'input[name="password"], #login-password';

                await page.waitForSelector(userSelector, { timeout: 10000 });
                await humanDelay(700, 1500);
                await humanType(page, userSelector, username);

                await humanDelay(800, 1500);
                await humanMove(page);
                await humanType(page, passSelector, password.toString());
            }

            await humanDelay(1500, 3000); // "Thinking" pause before clicking login
            await humanMove(page);

            if (accountId) {
                await saveScreenshotToDb(accountId, page);
                await saveLogToDb(accountId, "📸 Step 3: Credentials filled - submitting...");
            }
        } catch (e: any) {
            console.warn(`[DEBUG] Fill failed: ${e.message}`);
            return { success: false, error: "Reddit login form interaction failed. (Timeout/Selector change)" };
        }

        // Step 4: Submit
        step = "submit";
        await page.keyboard.press('Enter');
        console.log(`[DEBUG] Form submitted via Enter key...`);

        // Step 5: Wait for result
        step = "wait-result";
        try {
            const result = await Promise.race([
                page.waitForURL(
                    (url) => {
                        const u = url.toString();
                        return (u.includes("reddit.com") || u.includes("old.reddit.com")) &&
                            !u.includes("login") && !u.includes("register");
                    },
                    { timeout: 30000 }
                ).then(() => "success"),

                page.waitForSelector(
                    '.error, [role="alert"], .AnimatedForm__errorMessage, :text("Incorrect username"), :text("Invalid username"), :text("WRONG_PASSWORD"), :text("incorrect password")',
                    { timeout: 30000 }
                ).then(() => "error"),

                page.waitForSelector(
                    'iframe[title="reCAPTCHA"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha',
                    { timeout: 30000 }
                ).then(() => "captcha"),
            ]).catch(() => "timeout");

            console.log(`[DEBUG] Result: ${result}`);

            if (result === "captcha") {
                if (accountId) {
                    await saveScreenshotToDb(accountId, page);
                    await saveLogToDb(accountId, "❌ CAPTCHA detected.");
                }
                return { success: false, error: "❌ CAPTCHA detected. Reddit is blocking this server's IP." };
            }

            if (result === "error") {
                const errorText = await page.locator('.error, [role="alert"], .AnimatedForm__errorMessage').first().innerText().catch(() => "Invalid username or password");
                if (accountId) {
                    await saveScreenshotToDb(accountId, page);
                    await saveLogToDb(accountId, `❌ Error: ${errorText}`);
                }
                return { success: false, error: errorText };
            }

            if (result === "timeout") {
                if (accountId) {
                    await saveScreenshotToDb(accountId, page);
                    await saveLogToDb(accountId, "❌ Timeout (30s) - taking screenshot for diagnosis...");
                }
                return { success: false, error: "❌ Login timed out (30s). Check Live View screenshot for details." };
            }

            // Success!
            if (accountId) await saveLogToDb(accountId, "✅ Login successful! Verifying session...");
            const v = await verifySession(username);
            let finalUsername = v.name || username;

            if (username.includes("@") && !v.name) {
                try {
                    await page.goto("https://www.reddit.com/user/me", { waitUntil: 'domcontentloaded' });
                    const url = page.url();
                    if (url.includes("/user/")) {
                        finalUsername = url.split("/user/")[1].split("/")[0];
                    }
                } catch { }
            }

            const stats = await fetchRedditProfileStats(page).catch(() => null);
            const cookies = await context.cookies();

            if (accountId) await saveLogToDb(accountId, `✅ Verified as @${finalUsername}!`);

            return {
                success: true,
                username: finalUsername,
                karma: stats?.karma || 0,
                accountAge: stats?.ageDays || 0,
                cookies
            };

        } catch (e: any) {
            return { success: false, error: "Verification timed out." };
        }

    } catch (error: any) {
        console.error(`[DEBUG] Playwright error at step [${step}]:`, error);
        return { success: false, error: `Verification Error: [${step}] ${error.message || "Unknown error"}` };
    } finally {
        if (context) await context.close();
    }
}
