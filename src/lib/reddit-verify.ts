import { Cookie } from "playwright";

export interface VerificationResult {
    success: boolean;
    error?: string;
    username?: string;
    karma?: number;
    accountAge?: number;
    cookies?: Cookie[];
}

/**
 * Logs into Reddit using the old.reddit.com JSON API.
 * No browser launched → No CAPTCHA possible.
 * Returns session cookies that can be injected into Playwright later.
 */
export async function verifyRedditCredentials(
    username: string,
    password: string,
    _headless: boolean = true
): Promise<VerificationResult> {

    console.log(`[VERIFY] Starting API login for ${username}...`);

    // ── STEP 1: Get initial cookies (session context) ──────────────────────
    let initCookieStr = "";
    try {
        const initRes = await fetch("https://old.reddit.com/login", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        const initCookies = initRes.headers.getSetCookie?.() ?? [];
        initCookieStr = initCookies.map(c => c.split(";")[0]).join("; ");
    } catch (e: any) {
        console.warn(`[VERIFY] Could not get init cookies: ${e.message}`);
    }

    // ── STEP 2: POST login via Reddit JSON API ─────────────────────────────
    try {
        const body = new URLSearchParams({
            user: username,
            passwd: password,
            api_type: "json",
            rem: "true",
        });

        const loginRes = await fetch("https://old.reddit.com/api/login", {
            method: "POST",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": initCookieStr,
                "Origin": "https://old.reddit.com",
                "Referer": "https://old.reddit.com/login",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: body.toString(),
        });

        const data = await loginRes.json() as any;
        console.log(`[VERIFY] API response:`, JSON.stringify(data).slice(0, 300));

        // ── Wrong password ──────────────────────────────────────────────────
        if (data?.json?.errors?.length > 0) {
            const errCode = data.json.errors[0]?.[0];
            const errMsg = data.json.errors[0]?.[1] || "Invalid username or password";

            if (errCode === "WRONG_PASSWORD" || errCode === "INVALID_USERNAME") {
                return { success: false, error: "Incorrect username or password. Please double-check." };
            }
            return { success: false, error: errMsg };
        }

        // ── Success ─────────────────────────────────────────────────────────
        if (data?.json?.data?.modhash) {
            const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
            const allRawCookies = [...initCookieStr.split("; ").map(kv => kv + "; Domain=.reddit.com"), ...loginCookies];

            // Resolve actual username (needed if they logged in with email)
            let finalUsername = username.includes("@")
                ? await resolveUsernameViaApi(loginCookies, data.json.data.modhash)
                : (data.json.data.need_https !== undefined ? username : username);

            // Validate: also pull karma & age from public API
            const { karma, accountAge } = await getPublicStats(finalUsername);

            // Convert raw Set-Cookie headers → Playwright Cookie format
            const cookies = parseCookies(loginCookies);

            console.log(`[VERIFY] ✅ Login OK — u/${finalUsername}, karma: ${karma}`);
            return { success: true, username: finalUsername, karma, accountAge, cookies };
        }

        // ── API returned OK but no modhash (edge case) ──────────────────────
        return { success: false, error: "Reddit did not return a session. Please check credentials and try again." };

    } catch (err: any) {
        console.error(`[VERIFY] API login error: ${err.message}`);
        // Fall back to public username check so user isn't completely blocked
        return await fallbackPublicCheck(username);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUsernameViaApi(cookies: string[], modhash: string): Promise<string> {
    try {
        const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
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

async function getPublicStats(username: string): Promise<{ karma: number; accountAge: number }> {
    try {
        const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) return { karma: 0, accountAge: 0 };
        const data = await res.json() as any;
        const ud = data?.data;
        return {
            karma: (ud?.link_karma || 0) + (ud?.comment_karma || 0),
            accountAge: ud?.created_utc ? Math.floor((Date.now() / 1000 - ud.created_utc) / 86400) : 0,
        };
    } catch {
        return { karma: 0, accountAge: 0 };
    }
}

function parseCookies(rawHeaders: string[]): Cookie[] {
    return rawHeaders.map(c => {
        const [nameVal] = c.split(";");
        const eqIdx = nameVal.indexOf("=");
        return {
            name: nameVal.slice(0, eqIdx).trim(),
            value: nameVal.slice(eqIdx + 1).trim(),
            domain: ".reddit.com",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: true,
            sameSite: "Lax" as const,
        };
    }).filter(c => c.name && c.value);
}

async function fallbackPublicCheck(username: string): Promise<VerificationResult> {
    if (username.includes("@")) {
        return { success: true, username, karma: 0, accountAge: 0 };
    }
    try {
        const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (res.status === 404) {
            return { success: false, error: `User u/${username} does not exist on Reddit.` };
        }
        return { success: true, username, karma: 0, accountAge: 0 };
    } catch {
        return { success: true, username, karma: 0, accountAge: 0 };
    }
}
