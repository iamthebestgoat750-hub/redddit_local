import { chromium, BrowserContext, Cookie } from "playwright";
import { fetchRedditProfileStats } from "./reddit-actions";
import { getTempSessionPath } from "./session-manager";

export interface VerificationResult {
    success: boolean;
    error?: string;
    username?: string;
    karma?: number;
    accountAge?: number;
    cookies?: Cookie[];
}

// ─────────────────────────────────────────────
// METHOD 1: API-based login (NO browser, NO CAPTCHA)
// ─────────────────────────────────────────────
async function tryApiLogin(username: string, password: string): Promise<{
    success: boolean;
    username?: string;
    cookies?: Cookie[];
    error?: string;
}> {
    try {
        console.log(`[API-LOGIN] Attempting API login for ${username}...`);

        // Step 1: Get initial cookies from Reddit
        const initRes = await fetch("https://old.reddit.com/", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        // Collect initial cookies
        const setCookieHeaders = initRes.headers.getSetCookie?.() ?? [];
        const cookieStr = setCookieHeaders
            .map((c: string) => c.split(";")[0])
            .join("; ");

        // Step 2: POST login to Reddit JSON API
        const loginBody = new URLSearchParams({
            user: username,
            passwd: password,
            api_type: "json",
            rem: "false",
        });

        const loginRes = await fetch("https://old.reddit.com/api/login", {
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookieStr,
                "Origin": "https://old.reddit.com",
                "Referer": "https://old.reddit.com/login",
            },
            body: loginBody.toString(),
        });

        const data = await loginRes.json() as any;
        console.log(`[API-LOGIN] Response:`, JSON.stringify(data).substring(0, 200));

        // Check for errors
        if (data?.json?.errors?.length > 0) {
            const errMsg = data.json.errors[0]?.[1] || "Invalid username or password";
            return { success: false, error: errMsg };
        }

        // Check for success
        if (data?.json?.data?.modhash) {
            const actualUsername = username.includes("@")
                ? await resolveUsernameFromEmail(data.json.data.modhash, setCookieHeaders)
                : username;

            console.log(`[API-LOGIN] ✅ Login successful for ${actualUsername}`);

            // Convert to Playwright cookie format
            const cookies: Cookie[] = setCookieHeaders.map((c: string) => {
                const parts = c.split(";");
                const [nameVal] = parts[0].split("=");
                const value = parts[0].substring(nameVal.length + 1);
                return {
                    name: nameVal.trim(),
                    value: value.trim(),
                    domain: ".reddit.com",
                    path: "/",
                    expires: -1,
                    httpOnly: false,
                    secure: true,
                    sameSite: "Lax" as const,
                };
            }).filter((c: Cookie) => c.name && c.value);

            return { success: true, username: actualUsername, cookies };
        }

        return { success: false, error: "API login failed — no session returned." };
    } catch (err: any) {
        console.warn(`[API-LOGIN] Failed: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function resolveUsernameFromEmail(modhash: string, cookies: string[]): Promise<string> {
    try {
        const cookieStr = cookies.map((c: string) => c.split(";")[0]).join("; ");
        const res = await fetch("https://www.reddit.com/api/me.json", {
            headers: {
                "Cookie": cookieStr,
                "X-Modhash": modhash,
                "User-Agent": "Mozilla/5.0",
            },
        });
        const data = await res.json() as any;
        return data?.data?.name || "unknown";
    } catch {
        return "unknown";
    }
}

// ─────────────────────────────────────────────
// METHOD 2: Browser-based login (fallback)
// ─────────────────────────────────────────────
async function tryBrowserLogin(username: string, password: string, headless: boolean): Promise<VerificationResult> {
    let context: BrowserContext | undefined;
    let step = "init";
    const sessionPath = getTempSessionPath(username);

    try {
        step = "launch";
        console.log(`[BROWSER-LOGIN] Starting browser for ${username} (headless: ${headless})`);

        context = await chromium.launchPersistentContext(sessionPath, {
            headless,
            slowMo: 50,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
            ],
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport: { width: 1366, height: 768 },
        });

        const page = context.pages()[0] || await context.newPage();

        // Stealth scripts
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            (window as any).chrome = { runtime: {} };
            Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        });

        step = "navigate";
        console.log(`[BROWSER-LOGIN] Navigating to login page...`);
        await page.goto("https://www.reddit.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });

        step = "fill";
        console.log(`[BROWSER-LOGIN] Filling credentials...`);
        await page.click('input[name="username"], #login-username, [placeholder*="username"]');
        await page.keyboard.type(username, { delay: 120 });
        await page.click('input[name="password"], #login-password, [placeholder*="Password"]');
        await page.keyboard.type(password.toString(), { delay: 120 });

        step = "submit";
        console.log(`[BROWSER-LOGIN] Clicking login...`);
        await page.click('button[type="submit"], button:has-text("Log In")');

        step = "wait-result";
        console.log(`[BROWSER-LOGIN] Waiting for result...`);

        let result: string | null = null;
        try {
            result = await Promise.race([
                page.waitForURL(
                    (url) => url.toString().includes("reddit.com") && !url.toString().includes("login") && !url.toString().includes("register"),
                    { timeout: 30000 }
                ).then(() => "success").catch(() => null),

                page.waitForSelector(
                    '[role="alert"], .AnimatedForm__errorMessage, :text("Incorrect username or password"), :text("Invalid username or password")',
                    { timeout: 30000 }
                ).then(() => "error").catch(() => null),

                page.waitForSelector('iframe[title="reCAPTCHA"], iframe[src*="hcaptcha.com"], .h-captcha', { timeout: 30000 })
                    .then(() => "captcha").catch(() => null),

                new Promise<string>(resolve => setTimeout(() => resolve("timeout"), 32000)),
            ]) ?? "timeout";
        } catch {
            result = "timeout";
        }

        console.log(`[BROWSER-LOGIN] Result: ${result}`);

        if (result === "error") {
            const errorText = await page.locator('[role="alert"], .AnimatedForm__errorMessage').first().innerText().catch(() => "Invalid username or password");
            return { success: false, error: errorText };
        }

        if (result === "captcha") {
            return { success: false, error: "CAPTCHA detected. Reddit is blocking automated login from this server. Try logging in locally first." };
        }

        if (result === "timeout") {
            return { success: false, error: "Login timed out. Reddit may be showing a challenge. Try again later." };
        }

        // Verify session via API
        await page.waitForTimeout(2000);
        const apiData = await page.evaluate(async () => {
            try {
                const res = await fetch("https://www.reddit.com/api/me.json", { credentials: "include" });
                if (res.ok) return (await res.json()).data;
            } catch { }
            return null;
        });

        if (apiData?.name) {
            const cookies = await context.cookies();
            const stats = await fetchRedditProfileStats(page).catch(() => null);
            return {
                success: true,
                username: apiData.name,
                karma: stats?.karma || 0,
                accountAge: stats?.ageDays || 0,
                cookies,
            };
        }

        return { success: false, error: "Login appeared to succeed but session could not be verified." };

    } catch (err: any) {
        console.error(`[BROWSER-LOGIN] Error at step [${step}]:`, err);
        return { success: false, error: `Browser error: [${step}] ${err.message || "Unknown error"}` };
    } finally {
        if (context) await context.close();
    }
}

// ─────────────────────────────────────────────
// MAIN EXPORT: Try API first, browser as fallback
// ─────────────────────────────────────────────
export async function verifyRedditCredentials(
    username: string,
    password: string,
    headless: boolean = true
): Promise<VerificationResult> {
    console.log(`[VERIFY] Starting verification for ${username}`);

    // METHOD 1: API login (no browser, no CAPTCHA)
    const apiResult = await tryApiLogin(username, password);

    if (apiResult.success) {
        // Get karma/age via a quick browser check for stats only (no login needed)
        return {
            success: true,
            username: apiResult.username,
            karma: 0,
            accountAge: 0,
            cookies: apiResult.cookies,
        };
    }

    // If API says wrong password, don't try browser
    const isWrongPassword = apiResult.error?.toLowerCase().includes("password") ||
        apiResult.error?.toLowerCase().includes("incorrect") ||
        apiResult.error?.toLowerCase().includes("invalid") ||
        apiResult.error?.toLowerCase().includes("wrong");

    if (isWrongPassword) {
        return { success: false, error: apiResult.error };
    }

    // METHOD 2: Browser fallback
    console.log(`[VERIFY] API login failed (${apiResult.error}), falling back to browser...`);
    return tryBrowserLogin(username, password, headless);
}
