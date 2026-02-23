import { chromium, BrowserContext, Page } from "playwright";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { askGemini } from "@/lib/gemini";
import { getTempSessionPath, saveCookiesToDb, loadCookiesFromDb } from "@/lib/session-manager";

export interface WarmupResult {
    success: boolean;
    logs: string[];
    error?: string;
}

export async function warmupAccount(accountId: string, headless: boolean = true): Promise<WarmupResult> {
    const logs: string[] = [];
    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[WARMUP][${timestamp}] ${msg}`);
        logs.push(`${timestamp}: ${msg}`);
    };

    let context: BrowserContext | undefined;

    const checkStop = async () => {
        const acc = await prisma.redditAccount.findUnique({ where: { id: accountId }, select: { status: true } });
        if (acc?.status !== 'warmup' && acc?.status !== 'warming') {
            addLog("⏹️ Stop signal detected. Terminating session...");
            throw new Error("STOP_SIGNAL");
        }
    };

    try {
        const account = await prisma.redditAccount.findUnique({
            where: { id: accountId }
        });

        if (!account) throw new Error("Account not found");

        // Get temp session path (handles OS differences + lock file cleanup)
        const sessionPath = getTempSessionPath(account.username);

        // Update status to 'warmup' immediately
        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { status: "warmup" }
        });

        const password = decrypt(account.password);
        addLog(`Starting warmup for @${account.username}...`);

        context = await chromium.launchPersistentContext(sessionPath, {
            headless: headless,
            slowMo: 100,
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

        // ✅ CRITICAL: Load cookies from DB into browser BEFORE any navigation
        // This means if we saved cookies during account add (API login) or a previous warmup,
        // the browser is already logged in — no fresh login, no CAPTCHA!
        const cookiesLoaded = await loadCookiesFromDb(accountId, context);
        if (cookiesLoaded) {
            addLog("✅ Restored session from database — skipping login!");
        } else {
            addLog("No saved cookies found. Will attempt browser login...");
        }

        // ENHANCED STEALTH: Mock more browser properties
        await page.addInitScript(() => {
            // Hide webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // Mock Chrome runtime
            (window as any).chrome = { runtime: {} };

            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            (window.navigator.permissions as any).query = (parameters: any) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

            // Mock languages
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        // 1. Session Check / Login
        async function verifySession(expectedUser: string): Promise<boolean> {
            try {
                // Wait for any potential redirects to finish
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

                    // Allow match if names are equal OR if expected is an email (since API returns username)
                    if (actualName === expected || expectedUser.includes('@')) {
                        addLog(`✅ Session verified: Logged in as @${apiData.name}`);
                        return true;
                    } else {
                        addLog(`⚠️ Session mismatch: Logged in as @${apiData.name}, but expected @${expectedUser}`);
                        return false;
                    }
                }
            } catch { }
            return false;
        }

        addLog("Checking if already logged in...");
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            addLog("Initial page load timed out, retrying with basic check...");
        }

        // Wait up to 15s for either login button OR user menu to appear
        const isDetected = await Promise.race([
            page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"], [aria-label*="User menu"]', { timeout: 15000 }).then(() => true),
            page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', { timeout: 15000 }).then(() => false)
        ]).catch(() => false);

        let isLoggedIn = false;
        if (isDetected) {
            isLoggedIn = await verifySession(account.username);
        }

        if (!isLoggedIn) {
            addLog("No valid session found. Navigating to login...");
            await page.goto("https://www.reddit.com/login", { waitUntil: 'domcontentloaded' });

            const userSelector = 'input[name="username"], #login-username, [name="username"]';
            const passSelector = 'input[name="password"], #login-password, [name="password"]';

            await page.waitForSelector(userSelector, { timeout: 15000 });

            // Use click + type instead of fill to handle custom faceplate-text-input elements
            await page.click(userSelector);
            await page.keyboard.type(account.username, { delay: 100 });

            await page.click(passSelector);
            await page.keyboard.type(password, { delay: 100 });

            await page.click('button[type="submit"], button:has-text("Log In")');

            // Wait for landing on home
            await page.waitForURL((url) => url.toString().includes("reddit.com") && !url.toString().includes("login"), { timeout: 90000 });

            // Wait a few seconds to ensure cookies are ready
            addLog("Login successful. Saving session to DB...");
            await page.waitForTimeout(3000);

            // ✅ Save cookies to database (survives Render redeploys)
            await saveCookiesToDb(accountId, context!);

            // Final Verification
            const verified = await verifySession(account.username);
            if (!verified) {
                throw new Error("Login verification failed. Account might be locked or credentials incorrect.");
            }
            addLog("Login successful and verified.");
        } else {
            addLog("Active session detected and verified.");
        }

        await checkStop();

        // 2. Generic Browsing (Scrolling on Home)
        addLog("Simulating home feed browsing...");
        await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded' });

        await prisma.warmupLog.create({
            data: { redditAccountId: accountId, action: "browse", targetSubreddit: "home" }
        });

        for (let i = 0; i < 3; i++) {
            await checkStop();
            const scrollAmount = Math.floor(Math.random() * 600) + 400;
            await page.mouse.wheel(0, scrollAmount);
            addLog(`Scrolled ${scrollAmount}px and browsing...`);
            await page.waitForTimeout(Math.random() * 2000 + 1500);
        }

        // 3. Dynamic Subreddit Warmup (Randomly choose from 3 vetted communities)
        const warmupSubreddits = [
            "r/NoStupidQuestions",
            "r/AskReddit",
            "r/NewToReddit"
        ];
        const targetSubreddit = warmupSubreddits[Math.floor(Math.random() * warmupSubreddits.length)];

        addLog(`Selected warmup community: ${targetSubreddit}`);
        addLog(`Navigating to ${targetSubreddit} community...`);

        // Retry navigation up to 2 times with increased timeout
        let navSuccess = false;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await page.goto(`https://www.reddit.com/${targetSubreddit}/new/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                navSuccess = true;
                break;
            } catch (e) {
                addLog(`Navigation attempt ${attempt + 1} timed out. Retrying...`);
            }
        }
        if (!navSuccess) {
            addLog(`❌ Could not navigate to ${targetSubreddit} after 2 attempts.`);
            await prisma.redditAccount.update({ where: { id: accountId }, data: { status: "active" } });
            return { success: false, logs, error: "Navigation timeout" };
        }

        await checkStop();

        await prisma.warmupLog.create({
            data: { redditAccountId: accountId, action: "browse", targetSubreddit: targetSubreddit }
        });

        // Subreddit Scrolling
        addLog(`Browsing ${targetSubreddit} feed to build trust...`);
        for (let i = 0; i < 3; i++) {
            await checkStop();
            await page.mouse.wheel(0, 500);
            await page.waitForTimeout(2000);
        }

        // Find posts to engage with
        addLog("Finding posts to engage with...");
        try {
            await page.waitForSelector('shreddit-post', { timeout: 15000 });
        } catch (e) {
            addLog(`No posts appeared within 15s on ${targetSubreddit}.`);
        }

        const postElements = page.locator('shreddit-post');
        const count = await postElements.count();
        addLog(`Found ${count} posts on page. Collecting candidates...`);

        const candidateUrls: string[] = [];
        for (let i = 0; i < Math.min(count, 10); i++) {
            const url = await postElements.nth(i).getAttribute('permalink');
            if (url) candidateUrls.push(`https://www.reddit.com${url}`);
        }

        // --- STEP 3A: COMMUNITY VERIFICATION & UPVOTING ---
        const { upvotePost, joinAndComment, ensureJoinedCommunity } = require("./reddit-actions");

        // Verify and join community if needed
        await ensureJoinedCommunity(page, targetSubreddit);
        await checkStop();

        const upvoteCount = Math.min(Math.floor(Math.random() * 2) + 2, candidateUrls.length);
        const shuffled = [...candidateUrls].sort(() => Math.random() - 0.5);
        const postsToUpvote = shuffled.slice(0, upvoteCount);

        addLog(`Upvoting ${upvoteCount} posts in ${targetSubreddit} to build engagement...`);
        for (const upvoteUrl of postsToUpvote) {
            try {
                await page.goto(upvoteUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(1500);

                // Scroll to read the post a bit
                await page.mouse.wheel(0, Math.floor(Math.random() * 300) + 200);
                await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1500);

                await checkStop();
                const success = await upvotePost(page);
                if (success) {
                    addLog(`⬆️ Upvoted: ${upvoteUrl.split('/').pop()}`);
                    await prisma.warmupLog.create({
                        data: { redditAccountId: accountId, action: "upvote", targetSubreddit: targetSubreddit, targetPostId: upvoteUrl.split('/').pop() || "unknown" }
                    });
                }

                await page.waitForTimeout(Math.floor(Math.random() * 1500) + 1000);
            } catch (err: any) {
                if (err.message === "STOP_SIGNAL") throw err;
                addLog(`Upvote failed: ${(err as Error).message}`);
            }
        }

        // --- SAFE AGE CHECK: Skip comments for very new accounts ---
        const accountAgeDays = account.accountAge || 0;
        const MIN_AGE_FOR_COMMENTING = 1; // days — accounts < 1 day old: browse + upvote only

        if (accountAgeDays < MIN_AGE_FOR_COMMENTING) {
            addLog(`⚠️ Account is only ${accountAgeDays} day(s) old. Skipping comments to avoid shadow ban.`);
            addLog(`✅ Safe warmup complete: browsing + upvoting only. Comments unlock after 1 day.`);
        } else {
            // Go back to subreddit for commenting
            addLog(`Returning to ${targetSubreddit} for commenting...`);
            await page.goto(`https://www.reddit.com/${targetSubreddit}/new/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            // Re-collect post URLs
            const freshPostElements = page.locator('shreddit-post');
            const freshCount = await freshPostElements.count();
            const freshCandidateUrls: string[] = [];
            for (let i = 0; i < Math.min(freshCount, 10); i++) {
                const url = await freshPostElements.nth(i).getAttribute('permalink');
                if (url) freshCandidateUrls.push(`https://www.reddit.com${url}`);
            }
            const commentCandidates = freshCandidateUrls.filter(u => !postsToUpvote.includes(u));
            const finalCandidates = commentCandidates.length > 0 ? commentCandidates : freshCandidateUrls;

            // --- STEP 3B: COMMENT ON 1 POST ---
            let commentSuccess = false;
            for (let i = 0; i < Math.min(finalCandidates.length, 5); i++) {
                if (commentSuccess) break;

                const postUrl = finalCandidates[i];
                addLog(`[Comment Attempt ${i + 1}/5] Opening post: ${postUrl}`);

                // Navigate to the post first to read its content
                await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
                await page.waitForTimeout(2000);
                await checkStop();

                // NOW read the title + body from the actual post page
                let postTitle = "";
                let postBody = "";
                try {
                    postTitle = await page.locator('h1, [slot="title"], shreddit-post [slot="title"]').first().innerText({ timeout: 3000 });
                } catch {
                    postTitle = postUrl.split('/').slice(-2, -1)[0]?.replace(/_/g, ' ') || "a Reddit post";
                }
                try {
                    postBody = await page.locator('[slot="text-body"], [data-testid="post-content"], shreddit-post .md, .Post p').first().innerText({ timeout: 3000 });
                    if (postBody.length > 500) postBody = postBody.slice(0, 500) + "...";
                } catch {
                    postBody = "";
                }

                addLog(`Post: "${postTitle.slice(0, 60)}..."`);
                const postContext = postBody ? `Title: "${postTitle}"\nContent: "${postBody}"` : `Title: "${postTitle}"`;

                // Generate AI comment via Gemini
                let comment = "Great post! Thanks for sharing.";
                try {
                    const aiReply = await askGemini(
                        `You are a helpful Reddit user. Write a short, natural comment (1-2 sentences max) in response to this Reddit post:\n\n${postContext}\n\nBe genuine, friendly, and relevant. Do NOT use hashtags, emojis, or marketing language. Just the comment text.`
                    );
                    if (aiReply && aiReply.trim().length > 5) {
                        comment = aiReply.trim().replace(/^"|"$/g, '');
                    }
                } catch (aiErr) {
                    const fallbacks = [
                        "This community is so welcoming! Happy to be here.",
                        "I'm new to Reddit and finding these tips very helpful. Thanks!",
                        "Thanks for sharing this, exactly what a newcomer needs to know.",
                        "Great post! Love how supportive everyone is here."
                    ];
                    comment = fallbacks[Math.floor(Math.random() * fallbacks.length)];
                    addLog(`AI failed, using fallback: ${(aiErr as Error).message}`);
                }

                addLog(`Generated comment: "${comment.slice(0, 60)}..."`);

                // Call joinAndComment (it will navigate to the URL again, which is fine)
                await checkStop();
                const success = await joinAndComment(page, postUrl, comment);

                if (success) {
                    addLog(`✅ Successfully posted comment!`);
                    await prisma.warmupLog.create({
                        data: {
                            redditAccountId: accountId,
                            action: "comment",
                            targetSubreddit: targetSubreddit,
                            targetPostId: postUrl.split('/').pop() || "unknown"
                        }
                    });
                    commentSuccess = true;
                } else {
                    addLog(`Attempt ${i + 1} failed. Moving to next...`);
                }

                await page.waitForTimeout(2000);
            }

            if (!commentSuccess) {
                addLog("Could not comment on any of the attempted posts (all locked or failed).");
                await page.screenshot({ path: `error-comment-all-failed-${Date.now()}.png` });
            }
        }

        // 4. Update Database
        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { status: "active" } // Mark as active after warmup session
        });

        addLog("Warmup session completed successfully.");
        return { success: true, logs };

    } catch (error: any) {
        if (error.message === "STOP_SIGNAL") {
            addLog("⏹️ Session stopped successfully.");
            return { success: true, logs, error: "Stopped by user" };
        }
        addLog(`FATAL ERROR: ${error.message}`);
        // Reset status to active so user can try again
        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { status: "active" }
        }).catch(() => { });
        return { success: false, logs, error: error.message };
    } finally {
        if (context) await context.close();
    }
}
