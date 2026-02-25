import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { decrypt } from "@/lib/encryption";
import { fetchRedditProfileStats } from "@/lib/reddit-actions";
import { getTempSessionPath, saveCookiesToDb, loadCookiesFromDb } from "@/lib/session-manager";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const redditAccount = await prisma.redditAccount.findUnique({
            where: { id },
            include: { project: true }
        });

        if (!redditAccount || redditAccount.project.userId !== (session.user as any).id) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }

        const username = redditAccount.username;
        const password = decrypt(redditAccount.password);

        // Use temp path (ephemeral) — real session state comes from DB cookies
        const sessionPath = getTempSessionPath(username);

        const context = await chromium.launchPersistentContext(sessionPath, {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        });

        const page = context.pages()[0] || await context.newPage();

        try {
            // Restore cookies from DB first (survives restarts)
            await loadCookiesFromDb(id, context);

            // 1. Check if logged in
            await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });

            const isLoggedIn = await Promise.race([
                page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"], [aria-label*="User menu"]', { timeout: 10000 }).then(() => true),
                page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', { timeout: 10000 }).then(() => false)
            ]).catch(() => false);

            if (!isLoggedIn) {
                console.log(`[REFRESH] Not logged in for @${username}. Logging in...`);
                await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded', timeout: 30000 });

                const userSelector = 'input[name="username"], #login-username, [placeholder*="username"]';
                const passSelector = 'input[name="password"], #login-password, [placeholder*="Password"]';

                try {
                    await page.waitForSelector(userSelector, { timeout: 20000 });
                    await page.click(userSelector);
                    await page.keyboard.type(username, { delay: 100 });

                    await page.waitForSelector(passSelector, { timeout: 10000 });
                    await page.click(passSelector);
                    await page.keyboard.type(password, { delay: 100 });

                    await page.click('button[type="submit"], button:has-text("Log In")');
                    await page.waitForURL(url => url.toString().includes("reddit.com") && !url.toString().includes("login"), { timeout: 60000 });
                    console.log(`[REFRESH] Login successful for @${username}.`);

                    // Save fresh cookies to DB after successful login
                    await saveCookiesToDb(id, context);
                } catch (err: any) {
                    console.error("[REFRESH] Login interaction failed:", err.message);
                    const checkAgain = await page.evaluate(() => !!document.querySelector('shreddit-async-loader[bundlename="user_menu"], a[href*="/user/"]'));
                    if (!checkAgain) throw err;
                }
            } else {
                // Already logged in — refresh cookies in DB
                await saveCookiesToDb(id, context);
            }

            // 2. Fetch Stats
            const stats = await fetchRedditProfileStats(page);

            if (!stats) {
                throw new Error("Failed to scrape profile stats");
            }

            // 3. Update DB
            const updated = await prisma.redditAccount.update({
                where: { id },
                data: {
                    karma: stats.karma,
                    accountAge: stats.ageDays,
                    status: stats.status || "active",
                    updatedAt: new Date()
                },
            });

            return NextResponse.json({ message: "Health check complete", account: updated });
        } finally {
            await context.close();
        }
    } catch (error: any) {
        console.error("Refresh error:", error);
        return NextResponse.json({ error: error.message || "Failed to refresh account" }, { status: 500 });
    }
}
