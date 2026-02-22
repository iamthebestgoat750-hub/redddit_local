/**
 * session-manager.ts
 *
 * Saves and restores Playwright browser cookies to/from the database.
 * This ensures sessions survive Railway server restarts and redeploys.
 *
 * HOW IT WORKS:
 *  - After login: saveCookiesToDb(accountId, context) → stores cookies as JSON in DB
 *  - Before action: loadCookiesFromDb(accountId, context) → restores cookies from DB
 *  - No more relying on /sessions/ folder on disk!
 */

import { BrowserContext } from "playwright";
import { prisma } from "@/lib/db";
import path from "path";
import fs from "fs";

/**
 * Save browser cookies from a Playwright context into the database.
 * Call this after a successful login.
 */
export async function saveCookiesToDb(accountId: string, context: BrowserContext): Promise<void> {
    try {
        const cookies = await context.cookies();
        const cookiesJson = JSON.stringify(cookies);

        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { browserCookies: cookiesJson }
        });

        console.log(`[SESSION] ✅ Saved ${cookies.length} cookies to DB for account ${accountId}`);
    } catch (err) {
        console.error(`[SESSION] Failed to save cookies to DB:`, err);
    }
}

/**
 * Load cookies from database into a Playwright context.
 * Call this before performing any action to restore the session.
 * Returns true if cookies were loaded, false if none existed.
 */
export async function loadCookiesFromDb(accountId: string, context: BrowserContext): Promise<boolean> {
    try {
        const account = await prisma.redditAccount.findUnique({
            where: { id: accountId },
            select: { browserCookies: true }
        });

        if (!account?.browserCookies) {
            console.log(`[SESSION] No saved cookies in DB for account ${accountId}`);
            return false;
        }

        const cookies = JSON.parse(account.browserCookies);
        await context.addCookies(cookies);

        console.log(`[SESSION] ✅ Loaded ${cookies.length} cookies from DB for account ${accountId}`);
        return true;
    } catch (err) {
        console.error(`[SESSION] Failed to load cookies from DB:`, err);
        return false;
    }
}

/**
 * Clear saved cookies from DB (e.g. when account is banned or needs re-login).
 */
export async function clearCookiesFromDb(accountId: string): Promise<void> {
    try {
        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { browserCookies: null }
        });
        console.log(`[SESSION] 🗑️ Cleared cookies from DB for account ${accountId}`);
    } catch (err) {
        console.error(`[SESSION] Failed to clear cookies from DB:`, err);
    }
}

/**
 * Get a temp session path (still needed for launchPersistentContext which requires a dir).
 * We use /tmp which is available on all servers — data here is ephemeral but that's fine
 * because real session data is in the DB (cookies). The /tmp dir just holds Chrome's
 * process files, not the actual login state.
 */
export function getTempSessionPath(username: string): string {
    const safeName = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
    // Use /tmp on Linux/Railway, fallback to OS temp dir on Windows
    const tempBase = process.platform === 'win32'
        ? path.join(process.cwd(), 'sessions')
        : '/tmp/reddit-sessions';

    const sessionPath = path.join(tempBase, safeName);

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Clear stale lock files
    const locks = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const lock of locks) {
        const lockPath = path.join(sessionPath, lock);
        if (fs.existsSync(lockPath)) {
            try { fs.unlinkSync(lockPath); } catch (e) { }
        }
    }

    return sessionPath;
}
