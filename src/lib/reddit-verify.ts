import { chromium, BrowserContext, Page, Cookie } from "playwright";
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


export async function verifyRedditCredentials(username: string, password: string, headless: boolean = true): Promise<VerificationResult> {
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
                console.log(`[DEBUG] Already logged in via persistent session for ${v.name}`);
                const cookies = await context.cookies();
                return { success: true, username: v.name, cookies };
            }
        }

        // 1. Navigate to Login
        step = "navigate";
        console.log(`[DEBUG] Navigating to login page...`);
        try {
            await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e: any) {
            console.error(`[DEBUG] Navigation failed: ${e.message}`);
            return { success: false, error: `Could not reach Reddit login page. (Network error)` };
        }

        // 2. Fill credentials
        step = "fill";
        console.log(`[DEBUG] Filling credentials...`);
        try {
            const userSelector = 'input[name="username"], #login-username, [placeholder*="username"]';
            const passSelector = 'input[name="password"], #login-password, [placeholder*="Password"]';

            await page.click(userSelector);
            await page.keyboard.type(username, { delay: 150 });

            await page.click(passSelector);
            await page.keyboard.type(password.toString(), { delay: 150 });
        } catch (e: any) {
            console.error(`[DEBUG] Form detection/fill failed: ${e.message}`);
            return { success: false, error: "Reddit login form interaction failed. Please try again." };
        }

        // 3. Submit
        step = "submit";
        console.log(`[DEBUG] Clicking login...`);
        await page.click('button[type="submit"], button:has-text("Log In")');

        // 4. Wait for response or error
        step = "wait-result";
        try {
            console.log(`[DEBUG] Waiting for login result...`);

            const checkResult = async () => {
                const success = await page.waitForURL((url) => url.toString().includes("reddit.com") && !url.toString().includes("login") && !url.toString().includes("register"), { timeout: 300000 }).then(() => "success").catch(() => null);
                if (success) return success;

                const error = await page.waitForSelector('[role="alert"], .AnimatedForm__errorMessage, :text("Incorrect username or password"), :text("Invalid username or password")', { timeout: 5000 }).then(() => "error").catch(() => null);
                if (error) return error;

                const captcha = await page.waitForSelector('iframe[title="reCAPTCHA"]', { timeout: 5000 }).then(() => "captcha").catch(() => null);
                if (captcha) return captcha;

                return "timeout";
            };

            let result = await checkResult();

            if ((result === "timeout" || result === "captcha") && !headless) {
                console.log("[DEBUG] Visible Mode: Waiting for user manual intervention (CAPTCHA?)...");
                try {
                    await page.waitForURL((url) => url.toString() === "https://www.reddit.com/" || url.toString().includes("/user/"), { timeout: 120000 });
                    result = "success";
                } catch {
                    if (result === "captcha") return { success: false, error: "CAPTCHA not solved in time. Please try again." };
                }
            }

            console.log(`[DEBUG] Result detected: ${result}`);

            if (result === "error") {
                const errorText = await page.locator('[role="alert"], .AnimatedForm__errorMessage').first().innerText().catch(() => "Invalid username or password");
                return { success: false, error: errorText };
            }

            if (result === "captcha" && headless) {
                return { success: false, error: "CAPTCHA detected. Please use 'Show Browser' mode to solve it manually." };
            }

            const v = await verifySession(username);

            if (result === "success" || v.success) {
                if (page.url().includes("/login")) {
                    return { success: false, error: "Login flow incomplete. Still on login page." };
                }

                let finalUsername = v.name || username;

                if (!v.success && !username.includes('@')) {
                    return { success: false, error: "API verification failed after login." };
                }

                if (username.includes("@") && !v.name) {
                    console.log("[DEBUG] Email used and API check failed to return name. Fetching real username via /user/me...");
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
            }

            return { success: false, error: "Login failed or timed out. Please try Visible Mode." };

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
