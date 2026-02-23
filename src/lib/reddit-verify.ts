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
 * Verifies a Reddit account by checking if the username exists via Reddit's
 * public JSON API. No browser, no CAPTCHA, always works on cloud servers.
 *
 * Password is not verified here (to avoid CAPTCHA completely).
 * The bot will attempt a real login when it first uses the account (warmup/discovery),
 * and save cookies to the DB at that point.
 *
 * If the user provides an email instead of a username, we store it as-is
 * and let the first real login (warmup) resolve the actual username.
 */
export async function verifyRedditCredentials(
    username: string,
    _password: string,
    _headless: boolean = true
): Promise<VerificationResult> {

    // If the user gave an email, we can't check via public API.
    // Just accept it — the bot will verify on first use.
    if (username.includes("@")) {
        console.log(`[VERIFY] Email provided (${username}) — skipping public check, will verify on first bot use.`);
        return {
            success: true,
            username: username,
            karma: 0,
            accountAge: 0,
        };
    }

    try {
        console.log(`[VERIFY] Checking if Reddit user exists: ${username}`);

        const res = await fetch(
            `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            }
        );

        if (res.status === 404) {
            return { success: false, error: `Reddit user u/${username} does not exist. Please check the username.` };
        }

        if (res.status === 403 || res.status === 302) {
            // Account is suspended or private — it exists though
            console.log(`[VERIFY] Account ${username} is suspended or private (status ${res.status}). Saving anyway.`);
            return { success: true, username, karma: 0, accountAge: 0 };
        }

        if (!res.ok) {
            console.warn(`[VERIFY] Reddit returned ${res.status} for user ${username}`);
            // Accept the account anyway — don't block user over a Reddit API hiccup
            return { success: true, username, karma: 0, accountAge: 0 };
        }

        const data = await res.json() as any;
        const userData = data?.data;

        if (!userData) {
            return { success: false, error: "Could not read Reddit profile. Please try again." };
        }

        const karma = (userData.link_karma || 0) + (userData.comment_karma || 0);
        const accountAge = userData.created_utc
            ? Math.floor((Date.now() / 1000 - userData.created_utc) / 86400)
            : 0;

        console.log(`[VERIFY] ✅ u/${username} found — karma: ${karma}, age: ${accountAge} days`);

        return {
            success: true,
            username: userData.name || username, // use exact Reddit casing
            karma,
            accountAge,
        };

    } catch (err: any) {
        console.warn(`[VERIFY] Network error checking username: ${err.message}`);
        // Don't block the user because of a network issue — accept and move on
        return { success: true, username, karma: 0, accountAge: 0 };
    }
}
