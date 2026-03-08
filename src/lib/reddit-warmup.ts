import { BrowserContext, Page } from "playwright";
import { launchStealthContext, generateFingerprint, parseFingerprintFromDb } from "@/lib/stealth-browser";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { askGemini } from "@/lib/gemini";
import { getTempSessionPath, saveCookiesToDb, loadCookiesFromDb } from "@/lib/session-manager";
import { fetchRedditProfileStats, upvotePost, joinAndComment, ensureJoinedCommunity, scrapeSubredditRules } from "./reddit-actions";
import { getPlaywrightProxy } from "./proxy-config";

export interface WarmupResult {
    success: boolean;
    logs: string[];
    error?: string;
}

interface SessionPlan {
    upvoteGoal: number;
    commentGoal: number;
    browseMinutes: number;
    dayNumber: number;
}

// Warmup-safe subreddits — user-selected list
const WARMUP_SUBREDDITS = [
    "r/NewToReddit",
    "r/NoStupidQuestions",
    "r/CasualConversation",
    "r/AskReddit",
];

// Subreddit tone guide for AI comments
const SUBREDDIT_TONE_MAP: Record<string, string> = {
    "NewToReddit": "Be warm, welcoming, and encouraging. The person is new — make them feel at home. Keep it friendly and simple.",
    "NoStupidQuestions": "Be genuinely helpful, supportive, and direct. People here have real questions — give real, practical answers without being condescending.",
    "CasualConversation": "Be friendly, open, and conversational. Share a related thought or ask a gentle open-ended question to keep the chat going naturally.",
    "AskReddit": "Be thoughtful, concise, and relatable. Share a relevant personal-sounding anecdote or a helpful insight that fits the question.",
};



// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Determine the warmup day number by counting distinct calendar days
 * that already have WarmupLog entries for this account.
 */
async function getWarmupDayNumber(accountId: string): Promise<number> {
    try {
        const logs = await prisma.warmupLog.findMany({
            where: { redditAccountId: accountId },
            select: { performedAt: true },
        });

        if (logs.length === 0) return 1;

        // Use LOCAL date (not UTC) so midnight in the user's timezone starts a new day
        const toLocalDateStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        };

        const distinctDays = new Set(
            logs.map((l) => toLocalDateStr(l.performedAt))
        );

        const todayStr = toLocalDateStr(new Date());

        // If today already has logs it's the current day number,
        // otherwise it's a new (incremented) day.
        if (distinctDays.has(todayStr)) {
            return distinctDays.size;
        } else {
            return distinctDays.size + 1;
        }
    } catch {
        return 1;
    }
}

/**
 * Return randomised session targets based on which warmup day it is.
 *
 * Schedule:
 *   Day 1    : browse only + 0-1 upvote (NO comments — brand new account)
 *   Day 2-7  : 1-2 comments, 1-2 upvotes
 *   Day 8-14 : 2-3 comments, 2-3 upvotes
 *   Day 15-21: 3-4 comments, 3-4 upvotes
 *   Day 22+  : 4-5 comments, 4-5 upvotes
 */
function getSessionPlan(dayNumber: number): SessionPlan {
    // All days now have 20-40 mins of browsing as requested
    const browseMinutes = randInt(20, 40);

    if (dayNumber <= 1) {
        return {
            upvoteGoal: 0,
            commentGoal: 0,
            browseMinutes,
            dayNumber,
        };
    }
    if (dayNumber <= 7) {
        return {
            upvoteGoal: randInt(2, 3),
            commentGoal: randInt(1, 3),
            browseMinutes,
            dayNumber,
        };
    }
    if (dayNumber <= 14) {
        return {
            upvoteGoal: randInt(3, 5),
            commentGoal: randInt(2, 4),
            browseMinutes,
            dayNumber,
        };
    }
    if (dayNumber <= 21) {
        return {
            upvoteGoal: randInt(5, 8),
            commentGoal: randInt(3, 5),
            browseMinutes,
            dayNumber,
        };
    }
    // Week 4 (Day 22-30)
    return {
        upvoteGoal: randInt(8, 12),
        commentGoal: randInt(5, 8),
        browseMinutes,
        dayNumber,
    };
}

/**
 * Check how many upvotes and comments were already logged TODAY for this account.
 * Used so resuming a session doesn't repeat already-done actions.
 */
async function getTodaysProgress(accountId: string): Promise<{ upvotesDone: number; commentsDone: number }> {
    try {
        const now = new Date();
        // Midnight local time
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const logs = await prisma.warmupLog.findMany({
            where: {
                redditAccountId: accountId,
                performedAt: { gte: midnight },
            },
            select: { action: true },
        });
        const upvotesDone = logs.filter(l => l.action === 'upvote').length;
        const commentsDone = logs.filter(l => l.action === 'comment').length;
        return { upvotesDone, commentsDone };
    } catch {
        return { upvotesDone: 0, commentsDone: 0 };
    }
}

/**
 * Mini-browse: scroll the current page for a REAL target duration.
 * Uses a deadline loop so the actual elapsed time matches the target seconds,
 * instead of a fixed scroll count that finishes too quickly.
 * Simulates a human reading a page naturally.
 */
async function miniBrowse(
    page: Page,
    addLog: (msg: string) => void,
    minSec = 20,
    maxSec = 60
): Promise<void> {
    const seconds = randInt(minSec, maxSec);
    addLog(`📖 Reading for ~${seconds}s...`);

    const deadline = Date.now() + seconds * 1000;

    while (Date.now() < deadline) {
        const scrollAmount = randInt(150, 500);
        await page.mouse.wheel(0, scrollAmount).catch(() => { });

        // Occasionally pause longer — like a human reading something interesting
        const pauseMs = Math.random() < 0.3
            ? randInt(4000, 9000)   // Long pause: reading a post
            : randInt(1500, 4000);  // Normal scroll pause
        await page.waitForTimeout(pauseMs);

        // Occasionally scroll back up a bit (human behaviour)
        if (Math.random() < 0.25) {
            await page.mouse.wheel(0, -randInt(80, 200)).catch(() => { });
            await page.waitForTimeout(randInt(500, 1500));
        }
    }
}

/**
 * Extended browse session - visits the home feed then 2-3 random subreddits.
 * Collects candidate post URLs from the visited subreddits for later engagement.
 */
async function extendedBrowse(
    page: Page,
    addLog: (msg: string) => void,
    checkStop: () => Promise<void>,
    subreddits: string[],
    browseMins: number = 15
): Promise<{ candidateUrls: string[]; visitedSubs: string[] }> {
    const candidateUrls: string[] = [];
    const visitedSubs: string[] = [];

    // Scale reading times based on total browse budget
    const totalSecs = browseMins * 60;
    // Home feed gets 25% of budget, subreddits share the rest
    const homeSecs = Math.floor(totalSecs * 0.25);
    const homeFeedMin = Math.floor(homeSecs * 0.8);
    const homeFeedMax = homeSecs;
    // Number of subs scales with time: ~1 sub per 3 min
    const maxSubs = Math.max(1, Math.floor(browseMins / 3));
    const secsPerSub = Math.floor((totalSecs * 0.6) / maxSubs);

    addLog(`🏠 Browsing home feed...`);
    try {
        await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
        addLog("⚠️ Home feed slow — retrying...");
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
        } catch {
            addLog("⚠️ Home feed load failed — skipping to subreddits...");
        }
    }
    await page.waitForTimeout(randInt(1500, 4000));
    await miniBrowse(page, addLog, homeFeedMin, homeFeedMax);
    await checkStop();

    // ── 2. Visit subreddits (limited by time budget) ───────────────
    const shuffledSubs = [...subreddits].sort(() => Math.random() - 0.5);
    const subsToVisit = shuffledSubs.slice(0, maxSubs);
    addLog(`📋 Visiting ${subsToVisit.length} subreddit(s) in ${browseMins}min budget...`);

    for (const sub of subsToVisit) {
        await checkStop();
        addLog(`📌 Visiting ${sub}...`);
        try {
            await page.goto(`https://www.reddit.com/${sub}/`, {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            await page.waitForTimeout(randInt(1500, 4000));
            const subMin = Math.floor(secsPerSub * 0.8);
            const subMax = secsPerSub;
            await miniBrowse(page, addLog, subMin, subMax);

            visitedSubs.push(sub);

            // Collect post URLs from this subreddit for potential actions later
            await page.waitForSelector("shreddit-post", { timeout: 10000 }).catch(() => { });
            const postEls = page.locator("shreddit-post");
            const cnt = await postEls.count();
            const subredditCandidates: string[] = [];
            for (let i = 0; i < Math.min(cnt, 5); i++) {
                const href = await postEls.nth(i).getAttribute("permalink");
                if (href) {
                    const fullUrl = `https://www.reddit.com${href}`;
                    subredditCandidates.push(fullUrl);
                    candidateUrls.push(fullUrl);
                }
            }

            // ── RULES SCRAPING: First visit or stale rules ───────────
            const subName = sub.replace('r/', '');
            try {
                const existing = await prisma.subreddit.findUnique({ where: { name: subName } });
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                if (!existing || !existing.rules || !existing.lastScraped || existing.lastScraped < sevenDaysAgo) {
                    addLog(`📋 Scraping rules for ${sub}...`);
                    const rules = await scrapeSubredditRules(page, sub);
                    await prisma.subreddit.upsert({
                        where: { name: subName },
                        update: { rules, lastScraped: new Date() },
                        create: { name: subName, rules, lastScraped: new Date() },
                    });
                    addLog(`✅ Rules saved for ${sub}.`);
                    // Navigate back to the subreddit after scraping rules page
                    await page.goto(`https://www.reddit.com/${sub}/`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });
                    await page.waitForTimeout(randInt(2000, 4000));
                } else {
                    addLog(`📋 Rules for ${sub} already cached — skipping scrape.`);
                }
            } catch (ruleErr) {
                addLog(`⚠️ Rules scrape failed for ${sub}: ${(ruleErr as Error).message}`);
            }

            // ── JOIN LOGIC: Skip if already joined (DB records it) ───
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const subRecord = await (prisma.subreddit as any).findUnique({ where: { name: sub.replace('r/', '') } });
            if (subRecord?.isJoined) {
                addLog(`✅ Already joined ${sub} — skipping join check.`);
            } else if (Math.random() < 0.6) {
                const waitBeforeJoin = randInt(5000, 15000);
                await page.waitForTimeout(waitBeforeJoin);
                const joined = await ensureJoinedCommunity(page, sub);
                if (joined) {
                    // Save isJoined=true — run `npx prisma generate` to get full types
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (prisma.subreddit as any).upsert({
                        where: { name: sub.replace('r/', '') },
                        update: { isJoined: true },
                        create: { name: sub.replace('r/', ''), isJoined: true },
                    });
                }
                await page.waitForTimeout(randInt(10000, 25000));
            } else {
                addLog(`ℹ️ Decided not to join ${sub} this time (randomness).`);
            }
        } catch {

            addLog(`⚠️ Could not visit ${sub}, skipping...`);
        }

        await checkStop();

        // Rest between subreddits — 45 to 90 seconds
        const gapSec = randInt(45, 90);
        addLog(`⏳ Resting ${gapSec}s before next...`);
        await page.waitForTimeout(gapSec * 1000);
    }

    addLog(`✅ Extended browse done. Collected ${candidateUrls.length} candidate posts.`);
    return { candidateUrls, visitedSubs };
}

/**
 * Generate an AI comment for a post; falls back to a curated human-sounding phrase.
 */
async function generateComment(
    page: Page,
    postUrl: string,
    subredditName: string,
    addLog: (msg: string) => void
): Promise<string> {
    let postTitle = "";
    let postBody = "";

    try {
        postTitle = await page
            .locator('h1, [slot="title"], shreddit-post [slot="title"]')
            .first()
            .innerText({ timeout: 3000 });
    } catch {
        postTitle = postUrl.split("/").slice(-2, -1)[0]?.replace(/_/g, " ") || "a Reddit post";
    }
    try {
        postBody = await page
            .locator('[slot="text-body"], [data-testid="post-content"], shreddit-post .md, .Post p')
            .first()
            .innerText({ timeout: 3000 });
        if (postBody.length > 500) postBody = postBody.slice(0, 500) + "...";
    } catch {
        postBody = "";
    }

    const toneGuide =
        SUBREDDIT_TONE_MAP[subredditName] ||
        `Match the tone of r/${subredditName}. Be natural, contextual, and community-appropriate.`;
    const postContext = postBody
        ? `Title: "${postTitle}"\nContent: "${postBody}"`
        : `Title: "${postTitle}"`;

    // ── Fetch community rules from DB ─────────────────────────────
    let communityRulesSection = '';
    try {
        const subRecord = await prisma.subreddit.findUnique({ where: { name: subredditName } });
        if (subRecord?.rules && subRecord.rules !== '(Rules unavailable)' && subRecord.rules !== '(No explicit rules listed for this community)') {
            communityRulesSection = `\n\n**⚠️ MANDATORY COMMUNITY RULES (YOU MUST FOLLOW THESE — VIOLATION = BAN):**\n${subRecord.rules}`;
            addLog(`📋 Loaded ${subRecord.rules.split('\n').length} rules for r/${subredditName} into AI prompt.`);
        }
    } catch { }

    try {
        const aiReply = await askGemini(
            `You are a real Reddit user who wants to write a comment that gets upvoted.

**Subreddit:** r/${subredditName}
**Subreddit Tone Guide:** ${toneGuide}${communityRulesSection}

**Post Details:**
${postContext}

**Your task:**
Write a single comment (1-3 sentences MAX) that:
1. Is SPECIFIC to this post — reference an actual detail from the title or content
2. Sounds like a real human, NOT a bot or marketer
3. Matches the tone and culture of r/${subredditName} exactly
4. Either shares a brief relatable experience or gives quick helpful insight
5. Would realistically get 5–50 upvotes from this subreddit's community
6. STRICTLY OBEYS all community rules listed above — if any rule says no AI content, your comment MUST sound entirely original and human

**STRICT HUMAN-LIKE RULES:**
- BE CASUAL: Use common Reddit contractions (don't, it's, etc.).
- AVOID PERFECT CAPS: Occasionally start sentences with lowercase (e.g., "i think" instead of "I think").
- BE BRIEF: Humans on Reddit are often blunt or short. Don't be overly helpful.
- NO formal structure, NO corporate talk, NO hashtags/emojis.
- Output ONLY the comment text.`
        );
        if (aiReply && aiReply.trim().length > 5) {
            return aiReply.trim().replace(/^"|"$/g, "");
        }
    } catch (aiErr) {
        addLog(`AI failed, using fallback: ${(aiErr as Error).message}`);
    }

    const fallbacks = [
        "Honestly been wondering the same thing for a while — glad someone finally asked.",
        "This is actually more common than people think. Happened to me too.",
        "Good point, I hadn't thought about it from that angle before.",
        "Yeah this community is surprisingly helpful, keep the questions coming.",
        "Never thought about it this way but you're completely right.",
        "This explains a lot actually, thanks for putting it into words.",
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Execute the warmup actions (upvotes + comments) in a fully randomised order.
 *
 * Each individual action is separated by a mini-browse gap.
 * Actions are shuffled so comments and upvotes never happen in a fixed order.
 * Even if the goal is 3 upvotes they are spread across the session individually.
 */
async function executeMixedSession(
    page: Page,
    plan: SessionPlan,
    candidateUrls: string[],
    visitedSubs: string[],
    accountId: string,
    addLog: (msg: string) => void,
    checkStop: () => Promise<void>
): Promise<void> {
    type Task = { type: "upvote" | "comment"; url: string; sub: string };

    if (candidateUrls.length === 0) {
        addLog("⚠️ No candidate posts found. Skipping engagement.");
        return;
    }

    // Build individual task objects (one per upvote, one per comment)
    const tasks: Task[] = [];
    const shuffledUrls = [...candidateUrls].sort(() => Math.random() - 0.5);

    // Assign upvote tasks
    const upvoteUrls = shuffledUrls.slice(0, Math.min(plan.upvoteGoal, shuffledUrls.length));
    for (const url of upvoteUrls) {
        const sub = visitedSubs[Math.floor(Math.random() * visitedSubs.length)] || "AskReddit";
        tasks.push({ type: "upvote", url, sub });
    }

    // Assign comment tasks (use different URLs from upvote ones where possible)
    const remainingUrls = shuffledUrls
        .filter((u) => !upvoteUrls.includes(u))
        .concat(shuffledUrls); // fallback if not enough unique
    for (let i = 0; i < plan.commentGoal; i++) {
        const url = remainingUrls[i % remainingUrls.length];
        const sub = visitedSubs[Math.floor(Math.random() * visitedSubs.length)] || "AskReddit";
        tasks.push({ type: "comment", url, sub });
    }

    // ── SHUFFLE ALL TASKS (this is the key — random mixed order) ──
    tasks.sort(() => Math.random() - 0.5);

    addLog(
        `🎯 Session plan — Day ${plan.dayNumber}: ${plan.upvoteGoal} upvotes, ${plan.commentGoal} comments (mixed random order)`
    );
    addLog(`📋 Task queue: [${tasks.map((t) => t.type).join(" → ")}]`);

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        await checkStop();

        // ── Gap between tasks: mini browse ─────────────────────────
        if (i > 0) {
            const gapSec = randInt(30, 90);
            addLog(`⏳ Gap between actions: ${gapSec}s of browsing...`);
            await miniBrowse(page, addLog, gapSec - 10, gapSec + 10);
            await checkStop();
        }

        // ── Navigate to the post ────────────────────────────────────
        try {
            addLog(`🔗 Navigating to post [${task.type}]...`);
            await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(randInt(1500, 3000));

            // Read the post for a bit (human behaviour)
            await miniBrowse(page, addLog, 15, 40);
            await checkStop();
        } catch {
            addLog(`⚠️ Navigation failed, skipping this task.`);
            continue;
        }

        // ── Execute the task ────────────────────────────────────────
        if (task.type === "upvote") {
            const success = await upvotePost(page);
            if (success) {
                addLog(`⬆️ Upvoted post.`);
                await prisma.warmupLog.create({
                    data: {
                        redditAccountId: accountId,
                        action: "upvote",
                        targetSubreddit: task.sub,
                        targetPostId: task.url.split("/").slice(-2)[0] || "unknown",
                    },
                });
            } else {
                addLog(`❌ Upvote failed.`);
            }
        } else {
            // Comment
            const subredditName = task.sub.replace("r/", "");
            const comment = await generateComment(page, task.url, subredditName, addLog);
            addLog(`💬 Generated comment: "${comment.slice(0, 60)}..."`);

            await checkStop();
            const success = await joinAndComment(page, task.url, comment);
            if (success) {
                addLog(`✅ Comment posted!`);
                await prisma.warmupLog.create({
                    data: {
                        redditAccountId: accountId,
                        action: "comment",
                        targetSubreddit: task.sub,
                        targetPostId: task.url.split("/").slice(-2)[0] || "unknown",
                    },
                });
            } else {
                addLog(`❌ Comment failed.`);
            }
        }

        // Short cooldown after each action
        const cooldownSec = randInt(20, 55);
        addLog(`💤 Cooling down ${cooldownSec}s after action...`);
        await page.waitForTimeout(cooldownSec * 1000);
    }

    addLog("✅ All mixed session tasks done.");
}

// ─────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────

export async function warmupAccount(accountId: string, headless: boolean = true): Promise<WarmupResult> {
    const logs: string[] = [];
    // ── Debounced log writer: prevents concurrent SQLite write/read collisions ──
    let _logWritePending = false;
    const addLog = async (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const fullMsg = `${timestamp}: ${msg}`;
        console.log(`[WARMUP][${timestamp}] ${msg}`);
        logs.push(fullMsg);

        // Skip if a write is already in flight (avoid concurrent SQLite writes)
        if (_logWritePending) return;
        _logWritePending = true;
        try {
            const safeJson = JSON.stringify(logs.slice(-50));
            await (prisma as any).redditAccount.update({
                where: { id: accountId },
                data: { lastDebugLogs: safeJson },
            });
        } catch (e) { } finally {
            _logWritePending = false;
        }
    };

    const captureScreenshot = async (page: Page) => {
        try {
            const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
            const base64 = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
            await (prisma as any).redditAccount.update({
                where: { id: accountId },
                data: { lastDebugScreenshot: base64 },
            });
        } catch (e) { }
    };

    let context: BrowserContext | undefined;

    const checkStop = async () => {
        const acc = await prisma.redditAccount.findUnique({
            where: { id: accountId },
            select: { status: true },
        });
        if (acc?.status !== "warmup" && acc?.status !== "warming") {
            addLog("⏹️ Stop signal detected. Terminating session...");
            throw new Error("STOP_SIGNAL");
        }
    };

    try {
        const account = await prisma.redditAccount.findUnique({ where: { id: accountId } });
        if (!account) throw new Error("Account not found");

        const sessionPath = getTempSessionPath(account.username);

        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { status: "warmup" },
        });

        const password = decrypt(account.password);
        await addLog(`Starting warmup for @${account.username}...`);

        // ── Determine warmup day before launching browser ──────────
        const dayNumber = await getWarmupDayNumber(accountId);
        const plan = getSessionPlan(dayNumber);

        // ── Subtract already-done actions from today (resume-safe) ─────
        const todaysDone = await getTodaysProgress(accountId);
        const remainingUpvotes = Math.max(0, plan.upvoteGoal - todaysDone.upvotesDone);
        const remainingComments = Math.max(0, plan.commentGoal - todaysDone.commentsDone);
        plan.upvoteGoal = remainingUpvotes;
        plan.commentGoal = remainingComments;

        await addLog(
            `📅 Warmup Day ${dayNumber} — Plan: ${remainingUpvotes} upvotes | ${remainingComments} comments | ~${plan.browseMinutes} min browse` +
            (todaysDone.upvotesDone > 0 || todaysDone.commentsDone > 0
                ? ` (Today already done: ${todaysDone.upvotesDone} upvotes, ${todaysDone.commentsDone} comments)`
                : '')
        );

        // ── Show active IP before browser launch ───────────────────
        try {
            const proxyConf = getPlaywrightProxy();
            if (proxyConf) {
                await addLog(`🛡️ Proxy active → Reddit will see IP: 161.77.143.192`);
            } else {
                await addLog(`⚠️ No proxy set — using your real IP!`);
            }
        } catch { }

        // ── Load or generate per-account fingerprint ───────────────
        let fingerprint = parseFingerprintFromDb((account as any).browserFingerprint);
        const isNewFingerprint = !(account as any).browserFingerprint;
        if (isNewFingerprint) {
            fingerprint = generateFingerprint();
            await prisma.redditAccount.update({
                where: { id: accountId },
                data: { browserFingerprint: JSON.stringify(fingerprint) } as any,
            });
            await addLog(`🖥️ New fingerprint: ${fingerprint.userAgent.match(/Chrome\/([\d.]+)/)?.[1]} | ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
        } else {
            await addLog(`🖥️ Reusing stored fingerprint: Chrome/${fingerprint.chromeVersion} | ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
        }

        // ── Launch browser ─────────────────────────────────────────
        const sessionSlowMo = randInt(80, 150); // Randomize per session
        const extensionPaths = process.env.CHROME_EXTENSIONS
            ? process.env.CHROME_EXTENSIONS.split(",").map(p => p.trim()).filter(Boolean)
            : [];
        if (extensionPaths.length > 0) {
            await addLog(`🧩 Loading ${extensionPaths.length} extension(s) in browser.`);
        }
        context = await launchStealthContext(sessionPath, {
            headless: headless,
            slowMo: sessionSlowMo,
            proxy: getPlaywrightProxy() ?? undefined,
            fingerprint,
            extensionPaths,
        });

        const page = context.pages()[0] || (await context.newPage());

        // ── Restore cookies / login ─────────────────────────────────
        const cookiesLoaded = await loadCookiesFromDb(accountId, context);
        if (cookiesLoaded) {
            addLog("✅ Restored session from database — skipping login!");
        } else {
            addLog("No saved cookies found. Will attempt browser login...");
        }

        await page.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
            (window as any).chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions.query;
            (window.navigator.permissions as any).query = (parameters: any) =>
                parameters.name === "notifications"
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
            Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        });

        // ── Session verification (DOM-based — no API calls) ────────
        async function verifySession(expectedUser: string): Promise<boolean> {
            try {
                await page.waitForTimeout(2000);
                // Check for the user menu or profile link — present only when logged in
                const userLink = await page.$(
                    `a[href*="/user/${expectedUser}"], a[href*="/user/${expectedUser.toLowerCase()}"], [aria-label*="Profile"], a[href*="/settings/profile"]`
                );
                if (userLink) {
                    addLog(`✅ Session verified: @${expectedUser} is logged in (DOM check).`);
                    return true;
                }
                // Fallback: check for user menu container
                const menuEl = await page.$('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu');
                if (menuEl) {
                    addLog(`✅ Session verified: user menu detected for @${expectedUser}.`);
                    return true;
                }
            } catch { }
            return false;
        }

        addLog("Checking if already logged in...");
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch {
            addLog("Initial page load timed out, retrying...");
        }

        const isDetected = await Promise.race([
            page.waitForSelector(
                'shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"], [aria-label*="User menu"]',
                { timeout: 15000 }
            ).then(() => true),
            page.waitForSelector('a[href*="/login"], button:has-text("Log In"), #login-link', {
                timeout: 15000,
            }).then(() => false),
        ]).catch(() => false);

        // If user menu is visible → we're logged in (trust the DOM detection)
        // verifySession with email username was causing false failures
        let isLoggedIn = false;
        if (isDetected) {
            addLog(`✅ User menu detected — session active.`);
            isLoggedIn = true;
        }

        if (!isLoggedIn) {
            await addLog("No valid session. Logging in...");
            await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
            await captureScreenshot(page);

            try {
                const loginBtn = await page.waitForSelector(
                    'a[href*="/login"], a:has-text("Log In"), button:has-text("Log In"), #login-link',
                    { timeout: 10000 }
                );
                await loginBtn!.click();
                await page.waitForURL(/login/, { timeout: 15000 }).catch(() => { });
            } catch {
                // Fallback: go directly to old.reddit.com/login (simpler UI, less bot detection)
                await page.goto("https://old.reddit.com/login", {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
            }


            await captureScreenshot(page);
            const userSelector = 'input[name="username"], #login-username, [name="username"]';
            const passSelector = 'input[name="password"], #login-password, [name="password"]';
            await page.waitForSelector(userSelector, { timeout: 15000 });
            await page.click(userSelector);
            await page.keyboard.type(account.username, { delay: randInt(200, 500) });
            await page.click(passSelector);
            await page.keyboard.type(password, { delay: randInt(200, 500) });

            await page.click('button[type="submit"], button:has-text("Log In")');
            await page.waitForURL(
                (url) => url.toString().includes("reddit.com") && !url.toString().includes("login"),
                { timeout: 90000 }
            );
            await captureScreenshot(page);
            await addLog("Login successful!");
            await page.waitForTimeout(3000);
            await saveCookiesToDb(accountId, context!);

            const verified = await verifySession(account.username);
            if (!verified) throw new Error("Login verification failed.");
            await addLog("✅ Login verified and session saved!");
        } else {
            await addLog("✅ Active session detected — no login needed.");
        }

        // ── Refresh stats ───────────────────────────────────────────
        try {
            await addLog("📊 Refreshing account stats...");
            const stats = await fetchRedditProfileStats(page);
            if (stats) {
                await prisma.redditAccount.update({
                    where: { id: accountId },
                    data: { karma: stats.karma, accountAge: stats.ageDays, updatedAt: new Date() },
                });
                await addLog(`✅ Stats: ${stats.karma} Karma, ${stats.ageDays} Days.`);
            }
        } catch (err: any) {
            await addLog(`⚠️ Could not update stats: ${err.message}`);
        }

        await checkStop();

        // ── Extended Mixed Session ──────────────────────────────────
        await addLog("🌐 Starting extended mixed browsing & engagement session...");

        // Home browse first (~15% of budget)
        const homeSecs = Math.floor(plan.browseMinutes * 60 * 0.15);
        addLog(`🏠 Browsing home feed for ~${homeSecs}s...`);
        try {
            await page.goto("https://www.reddit.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(randInt(2000, 5000));
            await miniBrowse(page, addLog, Math.floor(homeSecs * 0.8), homeSecs);
        } catch {
            addLog("⚠️ Home feed load slow, skipping to subreddits.");
        }

        // Subreddit browsing + interleaved actions
        const shuffledSubs = [...WARMUP_SUBREDDITS].sort(() => Math.random() - 0.5);
        const maxSubs = Math.max(2, Math.floor(plan.browseMinutes / 4));
        let subsToVisit = shuffledSubs.slice(0, maxSubs);

        // If comment goal > available subreddits, repeat the list so the bot
        // has enough visits to complete all planned comments.
        // (Each repeated visit still uses a DIFFERENT post due to commentedPostIds tracking)
        if (plan.commentGoal > subsToVisit.length) {
            const extra = plan.commentGoal - subsToVisit.length;
            const extraSubs = [...WARMUP_SUBREDDITS]
                .sort(() => Math.random() - 0.5)
                .slice(0, extra);
            subsToVisit = [...subsToVisit, ...extraSubs];
            addLog(`📋 Extended sub visits to ${subsToVisit.length} (goal: ${plan.commentGoal} comments).`);
        }

        const secsPerSub = Math.floor((plan.browseMinutes * 60 * 0.7) / subsToVisit.length);


        let upvotesDone = 0;
        let commentsDone = 0;

        // ── Load already-commented post IDs (from today's logs) so we never
        //    comment on the same post twice, even across resumed sessions. ─────
        const commentedPostIds = new Set<string>();
        try {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const pastComments = await prisma.warmupLog.findMany({
                where: {
                    redditAccountId: accountId,
                    action: 'comment',
                    performedAt: { gte: midnight },
                },
                select: { targetPostId: true },
            });
            pastComments.forEach(c => { if (c.targetPostId) commentedPostIds.add(c.targetPostId); });
            if (commentedPostIds.size > 0) {
                addLog(`📋 Skipping ${commentedPostIds.size} already-commented post(s) from earlier today.`);
            }
        } catch { }

        for (const sub of subsToVisit) {
            await checkStop();
            addLog(`📌 Visiting ${sub}...`);
            try {
                await page.goto(`https://www.reddit.com/${sub}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
                await page.waitForTimeout(randInt(3000, 6000));

                // ── JOIN FIRST ──────────────────────────────────────
                const subName = sub.replace('r/', '');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const subRecord = await (prisma.subreddit as any).findUnique({ where: { name: subName } });

                if (!subRecord?.isJoined) {
                    addLog(`➕ Checking join status for ${sub}...`);
                    await page.waitForTimeout(randInt(4000, 8000));
                    const joined = await ensureJoinedCommunity(page, sub);
                    if (joined) {
                        addLog(`✅ Successfully joined ${sub}!`);
                        await (prisma.subreddit as any).upsert({
                            where: { name: subName },
                            update: { isJoined: true },
                            create: { name: subName, isJoined: true }
                        }).catch(() => { });

                        // ── Dismiss Reddit's "Welcome" popup after joining ──────
                        // Reddit shows a modal with a "Got It" button which blocks
                        // any further interaction until dismissed.
                        try {
                            const gotItBtn = await page.waitForSelector(
                                'button:has-text("Got It"), button:has-text("Got it"), faceplate-button:has-text("Got It"), [data-testid="welcome-modal-dismiss"]',
                                { timeout: 5000 }
                            );
                            if (gotItBtn) {
                                addLog(`🔔 Dismissing welcome popup for ${sub}...`);
                                await gotItBtn.click();
                                await page.waitForTimeout(randInt(1000, 2000));
                                addLog(`✅ Welcome popup dismissed.`);
                            }
                        } catch {
                            // No popup appeared — that's fine, continue
                        }
                    }
                } else {
                    addLog(`✅ Already joined ${sub} — proceeding to browse.`);
                }

                await checkStop();

                // ── BROWSE AFTER JOIN ───────────────────────────────
                addLog(`📖 Reading ${sub} for ~${secsPerSub}s...`);
                // Use exact secsPerSub (no random range reduction) so total
                // session time actually matches the planned browseMinutes.
                await miniBrowse(page, addLog, secsPerSub, secsPerSub);

                // Grab some posts
                const postEls = page.locator("shreddit-post");
                const cnt = await postEls.count();
                const posts: string[] = [];
                for (let i = 0; i < Math.min(cnt, 5); i++) {
                    const href = await postEls.nth(i).getAttribute("permalink");
                    if (href) posts.push(`https://www.reddit.com${href}`);
                }

                // Decide if we do an action in this sub
                // We interleave actions: maybe an upvote, maybe a comment
                if (posts.length > 0) {
                    // Try to do one action per sub visit if goals aren't met
                    const doUpvote = upvotesDone < plan.upvoteGoal && Math.random() < 0.8;

                    // Smart comment guarantee: count how many subs are left
                    // (including this one) vs how many comments still needed.
                    // If remaining_subs <= remaining_comments, ALWAYS comment
                    // so we never finish a session short on the goal.
                    const subsRemaining = subsToVisit.length - subsToVisit.indexOf(sub);
                    const commentsNeeded = plan.commentGoal - commentsDone;
                    const mustComment = commentsNeeded > 0 && subsRemaining <= commentsNeeded;
                    const doComment = commentsNeeded > 0 && (mustComment || Math.random() < 0.8);

                    if (doUpvote) {
                        const url = posts[Math.floor(Math.random() * posts.length)];
                        addLog(`🔗 Interleaved action: upvoting a post in ${sub}...`);
                        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                        await miniBrowse(page, addLog, 15, 30);
                        const success = await upvotePost(page);
                        if (success) {
                            upvotesDone++;
                            addLog(`⬆️ Upvoted post in ${sub}.`);
                            await prisma.warmupLog.create({
                                data: { redditAccountId: accountId, action: "upvote", targetSubreddit: sub, targetPostId: url.split("/").slice(-2)[0] }
                            });
                        }
                        await page.waitForTimeout(randInt(5000, 15000));
                    }

                    if (doComment && commentsDone < plan.commentGoal) {
                        // Pick a post that hasn't been commented on before
                        const availablePosts = posts.filter(p => {
                            const postId = p.split("/").slice(-2)[0];
                            return !commentedPostIds.has(postId);
                        });

                        if (availablePosts.length === 0) {
                            addLog(`⚠️ All posts in ${sub} already commented — skipping.`);
                        } else {
                            const url = availablePosts[Math.floor(Math.random() * availablePosts.length)];
                            const postId = url.split("/").slice(-2)[0];
                            addLog(`💬 Interleaved action: commenting in ${sub}...`);
                            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                            await miniBrowse(page, addLog, 20, 45);
                            const subredditName = sub.replace("r/", "");
                            const commentTxt = await generateComment(page, url, subredditName, addLog);
                            const success = await joinAndComment(page, url, commentTxt);
                            if (success) {
                                commentsDone++;
                                commentedPostIds.add(postId); // mark as done in this session too
                                addLog(`✅ Commented in ${sub}.`);
                                await prisma.warmupLog.create({
                                    data: { redditAccountId: accountId, action: "comment", targetSubreddit: sub, targetPostId: postId }
                                });
                            }
                            await page.waitForTimeout(randInt(5000, 15000));
                        }
                    }
                }

            } catch (err: any) {
                addLog(`⚠️ Error visiting ${sub}: ${err.message}`);
            }
        }

        // ── Final stats refresh ─────────────────────────────────────
        await addLog("📊 Final stats refresh...");
        const finalStats = await fetchRedditProfileStats(page).catch(() => null);

        await prisma.redditAccount.update({
            where: { id: accountId },
            data: {
                status: "active",
                karma: finalStats?.karma ?? undefined,
                accountAge: finalStats?.ageDays ?? undefined,
                updatedAt: new Date(),
            },
        });

        await addLog(`🎉 Warmup Day ${dayNumber} complete!`);
        return { success: true, logs };

    } catch (error: any) {
        if (error.message === "STOP_SIGNAL") {
            addLog("⏹️ Session stopped by user.");
            return { success: true, logs, error: "Stopped by user" };
        }
        addLog(`FATAL ERROR: ${error.message}`);
        await prisma.redditAccount.update({
            where: { id: accountId },
            data: { status: "active" },
        }).catch(() => { });
        return { success: false, logs, error: error.message };
    } finally {
        if (context) await context.close();
    }
}
