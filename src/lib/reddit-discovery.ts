import { prisma } from "./db";
import { askGemini } from "./gemini";
import { redis } from "./redis";
import { BrowserContext } from "playwright";
import { launchStealthContext } from "./stealth-browser";
import { addBrowserLog, fetchRedditProfileStats } from "./reddit-actions";
import { decrypt } from "./encryption";
import { getTempSessionPath, saveCookiesToDb, loadCookiesFromDb } from "./session-manager";
import { getPlaywrightProxy } from "./proxy-config";

export interface DiscoveredPost {
    redditId: string;
    title: string;
    content: string;
    author: string;
    subreddit: string;
    url: string;
}

interface ScoredPost extends DiscoveredPost {
    score: number;
    intent: string;
    analysis: string;
}

/**
 * Browser-based scraper for Reddit Search (Visible mode / Deep Scan)
 */
async function fetchRedditPostsBrowser(page: any, query: string, subreddit?: string): Promise<DiscoveredPost[]> {
    const posts: DiscoveredPost[] = [];
    try {
        const searchUrl = subreddit
            ? `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=year`
            : `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=new&t=year`;

        console.log(`[BROWSER SCAN] Navigating to: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Initial scroll to trigger lazy loading
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(5000);

        // Wait for ANY meaningful content to appear (titles or comment links)
        await page.waitForSelector('a[href*="/comments/"], [id^="post-title-"], shreddit-post', { timeout: 20000 }).catch(() => {
            console.log(`[BROWSER SCAN] Timeout waiting for content on ${searchUrl}`);
        });

        // Debug screenshot
        await page.screenshot({ path: 'discovery_debug.png' });

        // UNIVERSAL SEARCH LOCATOR: Find all links that look like post titles
        const postData = (await page.evaluate(`(function() {
            var results = [];
            var seenUrls = new Set();
            
            function findDeep(root, selector) {
                if (!root) return [];
                var elements = Array.from(root.querySelectorAll(selector));
                var children = Array.from(root.querySelectorAll('*'));
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (child.shadowRoot) {
                        elements = elements.concat(findDeep(child.shadowRoot, selector));
                    }
                }
                return elements;
            }
            
            var links = findDeep(document, 'a[href*="/comments/"]');

            for (var j = 0; j < links.length; j++) {
                var link = links[j];
                var href = link.href;
                if (!href || !href.includes('/comments/') || seenUrls.has(href)) continue;

                var titleEl = link.querySelector('h1, h2, h3, p');
                var titleText = (titleEl ? titleEl.textContent : link.textContent || "").trim();
                if (!titleText || titleText.length < 10 || titleText === "...") continue;

                var container = link.closest('shreddit-post, article, faceplate-tracker, [data-testid="post-container"]') || (link.parentElement ? link.parentElement.parentElement : null);
                
                var subreddit = "unknown";
                var content = titleText;
                var author = "unknown";

                if (container) {
                    var subEl = container.querySelector('a[href*="/r/"]');
                    if (subEl) subreddit = subEl.textContent.replace("r/", "").trim();
                    
                    var bodyEl = container.querySelector('div[id$="-post-rtjson-content"], shreddit-post-body, .md, [slot="text-body"], p');
                    if (bodyEl) content = bodyEl.textContent.trim();
                    
                    var authEl = container.querySelector('a[href*="/user/"]');
                    if (authEl) author = authEl.textContent.replace("u/", "").trim();
                }

                results.push({
                    redditId: href.split('/comments/')[1].split('/')[0] || "t3_" + Math.random().toString(36).substring(7),
                    title: titleText,
                    content: content || titleText,
                    author: author,
                    subreddit: subreddit,
                    url: href
                });
                seenUrls.add(href);
                if (results.length >= 25) break;
            }
            return results;
        })()`)) as any[];

        console.log(`[BROWSER SCAN] Extracted ${postData.length} posts via Universal Locator.`);
        for (const pd of postData) {
            console.log(`  🔍 Captured: "${pd.title.substring(0, 30)}..." | Sub: r/${pd.subreddit} | Body: ${pd.content.length > pd.title.length ? 'Yes' : 'No'}`);
        }
        posts.push(...postData);
    } catch (error) {
        console.error("[BROWSER SCAN ERROR]", error);
    }
    return posts;
}

/**
 * Directly scans the /new feed of a specific subreddit (Ultra Fast)
 */
async function scanSubredditNew(page: any, subreddit: string): Promise<DiscoveredPost[]> {
    const posts: DiscoveredPost[] = [];
    try {
        const feedUrl = `https://www.reddit.com/r/${subreddit}/new/`;
        console.log(`[NICHE SCAN] Scanning feed: ${feedUrl}`);

        await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(3000);

        const postElements = page.locator('shreddit-post, [data-testid="post-container"], article');
        let count = await postElements.count();

        for (let i = 0; i < Math.min(count, 12); i++) {
            const entry = postElements.nth(i);
            const redditId = await entry.getAttribute('id') || await entry.getAttribute('name') || `t3_${Math.random().toString(36).substring(7)}`;

            const title = await entry.evaluate((el: any) => {
                const titleEl = el.querySelector('h1, h2, h3, [slot="title"]');
                return titleEl?.innerText?.trim();
            }) || await entry.evaluate((el: any) => el.innerText.split('\n')[0]);

            const author = await entry.getAttribute('author') || "unknown";
            const permalink = await entry.getAttribute('permalink');
            const content = await entry.evaluate((el: any) => el.querySelector('div[id$="-post-rtjson-content"], shreddit-post-body')?.innerText?.trim()) || "";

            if (title && title.length > 5) {
                posts.push({
                    redditId,
                    title,
                    content: content || title,
                    author,
                    subreddit,
                    url: permalink ? (permalink.startsWith('http') ? permalink : `https://www.reddit.com${permalink}`) : `https://www.reddit.com/r/${subreddit}`
                });
            }
        }
    } catch (e) {
        console.error(`[NICHE SCAN ERROR] r/${subreddit} failed:`, e);
    }
    return posts;
}

/**
 * Turns simple keywords into a list of 5-8 smart Reddit search queries.
 */
export async function generateSearchQueries(keywords: string[]): Promise<string[]> {
    const prompt = `
    I have a project that provides a solution related to these keywords: ${keywords.join(", ")}.
    
    Generate 6 different Reddit search strings that would find potential users or customers.
    Focus on finding people who:
    1. Are expressing a PROBLEM that these keywords solve.
    2. Are seeking RECOMMENDATIONS for tools/services in this niche.
    3. Are asking QUESTIONS about how to achieve something related to these keywords.
    
    Important: 
    - Do NOT use "site:reddit.com".
    - Use phrases like "how to", "best way to", "anyone know", "recommendations for".
    - Return ONLY a JSON array of strings.
    `;

    try {
        const response = await askGemini(prompt);
        if (!response) {
            // Programmatic fallback if AI is rate-limited or fails
            return [
                ...keywords,
                ...keywords.map(k => `best ${k}`),
                ...keywords.map(k => `anyone know ${k}`),
                ...keywords.map(k => `how to ${k}`)
            ].slice(0, 10);
        }
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error("[DISCOVERY] JSON parse failed for query generation:", e);
            }
        }
        return keywords;
    } catch (e) {
        console.error("[DISCOVERY] Query generation failed:", e);
        return keywords;
    }
}

/**
 * Fetches posts from Reddit with RapidAPI fallback.
 */
export async function fetchRedditPosts(query: string): Promise<DiscoveredPost[]> {
    try {
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=25&sort=new&t=year`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PostLoomBot/1.0' } });
        if (res.ok) {
            const text = await res.text();
            if (!text || text.trim() === "") return [];
            try {
                const data = JSON.parse(text);
                return (data.data.children || []).map((item: any) => ({
                    redditId: item.data.id,
                    title: item.data.title,
                    content: item.data.selftext || "",
                    author: item.data.author,
                    subreddit: item.data.subreddit,
                    url: `https://reddit.com${item.data.permalink}`
                }));
            } catch (e) {
                console.error("[DISCOVERY] JSON parse failed for reddit.json:", e);
            }
        }
    } catch (e) { }
    return [];
}

/**
 * Local keyword pre-filter: checks if a post's title or content
 * contains at least one keyword. Skips AI call for obviously irrelevant posts.
 */
function hasKeywordOverlap(post: DiscoveredPost, keywords: string[]): boolean {
    const text = `${post.title} ${post.content}`.toLowerCase();
    const allWords = keywords.flatMap(k => k.toLowerCase().split(/\s+/)).filter(Boolean);
    return allWords.some(kw => text.includes(kw));
}

/**
 * Fallback scoring when AI is unavailable.
 * Uses keyword frequency, question patterns, and buying signals.
 */
function keywordBasedScore(post: DiscoveredPost, keywords: string[]): { score: number; intent: string; analysis: string } {
    const text = `${post.title} ${post.content}`.toLowerCase();

    // Count keyword matches
    const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    const keywordRatio = matchCount / keywords.length;

    // Buying intent signals
    const buyingWords = ["consiglio", "raccomandazione", "quale", "meglio", "aiuto", "come fare", "ho bisogno", "cerco", "suggest", "recommend", "best", "advice", "help", "how to", "looking for", "need", "which"];
    const hasBuyingIntent = buyingWords.some(w => text.includes(w));

    // Question signals
    const isQuestion = post.title.includes("?") || text.includes("come") || text.includes("how") || text.includes("quando") || text.includes("quanto");

    let score = 50; // base score for passing keyword filter
    if (keywordRatio > 0.3) score += 20;
    if (keywordRatio > 0.6) score += 15;
    if (hasBuyingIntent) score += 15;
    if (isQuestion) score += 10;

    const intent = hasBuyingIntent ? "buying" : "researching";
    return {
        score: Math.min(score, 95),
        intent,
        analysis: `Keyword fallback: ${matchCount}/${keywords.length} keywords matched. ${hasBuyingIntent ? "Has buying signals." : "Research post."}`
    };
}

/**
 * Batch AI scoring: scores up to 10 posts in a single API call.
 * Falls back to keyword-based scoring if AI quota is exhausted.
 */
async function batchAnalyzeRelevance(
    posts: DiscoveredPost[],
    keywords: string[],
    websiteDescription?: string
): Promise<{ score: number; intent: string; analysis: string }[]> {
    const postList = posts.map((p, i) =>
        `[${i + 1}] Title: ${p.title}\nContent: ${p.content.substring(0, 300)}\nSubreddit: r/${p.subreddit}`
    ).join("\n\n");

    const prompt = `
    Our Website/Solution: ${websiteDescription || keywords.join(", ")}
    Keywords: ${keywords.join(", ")}

    Score each Reddit post below for lead quality on a scale of 1 to 10.
    Intent: "buying" (looking for tool/service), "researching" (asking questions), or "irrelevant".
    
    Scoring: 9-10 = explicitly asking for recommendation matching our niche, 7-8 = problem our site solves, 5-6 = niche discussion, <5 = irrelevant.
    
    Posts:
    ${postList}

    Return ONLY a JSON array. Example: [{"score": 8, "intent": "buying", "analysis": "Asking for tool recommendation"}, ...]
    Return exactly ${posts.length} items, one per post, in the same order.
    `;

    try {
        await new Promise(r => setTimeout(r, 2000));
        const response = await askGemini(prompt);
        if (response) {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (Array.isArray(parsed) && parsed.length === posts.length) {
                        console.log(`[DISCOVERY] AI scoring successful for ${posts.length} posts.`);
                        return parsed;
                    }
                    while (parsed.length < posts.length) parsed.push(keywordBasedScore(posts[parsed.length], keywords));
                    return parsed.slice(0, posts.length);
                } catch (e) {
                    console.error("[DISCOVERY] Batch JSON parse failed:", e);
                }
            }
        }
    } catch (e) {
        console.error("[DISCOVERY] Batch analysis failed:", e);
    }

    // FALLBACK: AI quota exhausted — use keyword scoring
    console.warn(`[DISCOVERY] ⚠️ AI unavailable. Using keyword-based fallback scoring for ${posts.length} posts.`);
    return posts.map(post => keywordBasedScore(post, keywords));
}


/**
 * Generates a basic reply when AI quota is exhausted.
 * Uses project details and post context to form a natural-sounding message.
 */
function generateFallbackReply(post: ScoredPost, project: any): string {
    const websiteUrl = project.websiteUrl || "";
    const description = project.websiteDescription || project.description || "";
    const tone = (project.replyTone || "friendly").toLowerCase();

    const isBuying = post.intent === "buying";
    const greeting = tone.includes("professional") ? "Buona domanda." : "Ciao!";

    if (isBuying && websiteUrl) {
        return `${greeting} Per questo tipo di calcolo puoi usare ${websiteUrl} — è uno strumento pensato esattamente per questo, semplicissimo da usare.`;
    } else if (websiteUrl) {
        return `${greeting} ${description ? description.substring(0, 80) + "." : ""} Se ti può essere utile, dai un occhio a ${websiteUrl}.`;
    } else {
        return `${greeting} Ho avuto lo stesso dubbio — spero che qualcuno qui possa darti una risposta precisa!`;
    }
}

/**
 * Main discovery loop with Batch & Rank logic.
 */
export async function discoverLeads(projectId: string, debugMode: boolean = false, accountId?: string) {
    // Use raw SQL to bypass Prisma model limitations
    const projectResults: any[] = await prisma.$queryRaw`
        SELECT * FROM Project WHERE id = ${projectId} LIMIT 1
    `;
    const project = projectResults[0];
    if (!project) throw new Error("Project not found");

    const redditAccounts = await prisma.redditAccount.findMany({
        where: { projectId, status: { in: ["active", "warmup", "warmed", "cooldown"] } },
        take: 1
    });

    let selectedAccount = redditAccounts[0];
    if (accountId) {
        const specificAccount = await prisma.redditAccount.findUnique({ where: { id: accountId } });
        if (specificAccount) selectedAccount = specificAccount;
    }

    // Prioritize project description (keywords) over project name
    const projectName = project.name || projectId;
    const keywordSource = (project as any).description || project.name || "";
    const keywords = keywordSource.split(",").map((k: string) => k.trim()).filter(Boolean);
    console.log(`[DISCOVERY] Project: ${projectName} | Keywords: ${keywords.join(", ")}`);

    let replyPosted = false;
    let totalScanned = 0;
    const allFoundPosts: DiscoveredPost[] = [];
    let context: BrowserContext | undefined;

    try {
        // ALWAYS launch browser with saved session when an account is selected
        if (selectedAccount) {
            const username = selectedAccount.username;
            // Use getTempSessionPath (handles OS + lock file cleanup)
            const sessionPath = getTempSessionPath(username);

            console.log(`[DISCOVERY] Launching browser for @${username} (headless: ${!debugMode})`);

            context = await launchStealthContext(sessionPath, {
                headless: !debugMode,
                slowMo: debugMode ? 50 : 0,
                proxy: getPlaywrightProxy() ?? undefined,
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

            // ✅ Restore cookies from DB first (survives restarts)
            await loadCookiesFromDb(selectedAccount.id, context);

            async function verifySession(expectedUser: string): Promise<boolean> {
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
                        if (actualName === expectedUser.toLowerCase() || expectedUser.includes('@')) return true;
                    }
                } catch { }
                return false;
            }

            console.log(`[DISCOVERY] Checking session for @${username}...`);
            try {
                await page.goto("https://www.reddit.com/", { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e) { /* timeout ok */ }


            const isDetected = await Promise.race([
                page.waitForSelector('shreddit-async-loader[bundlename="user_menu"], #nav-user-menu, a[href*="/user/"]', { timeout: 12000 }).then(() => true),
                page.waitForSelector('a[href*="/login"], button:has-text("Log In")', { timeout: 12000 }).then(() => false)
            ]).catch(() => false);

            let isLoggedIn = false;
            if (isDetected) {
                isLoggedIn = await verifySession(username);
            }

            if (!isLoggedIn) {
                console.log(`[DISCOVERY] Session expired or invalid for @${username}. Logging in...`);
                try {
                    const password = decrypt(selectedAccount.password);
                    const userSelector = 'input[name="username"], #login-username, [name="username"]';
                    const passSelector = 'input[name="password"], #login-password, [name="password"]';

                    await page.goto("https://old.reddit.com/login", { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector(userSelector, { timeout: 15000 });

                    // Click + Type for custom elements (faceplate-text-input)
                    await page.click(userSelector);
                    await page.keyboard.type(username, { delay: 100 });

                    await page.click(passSelector);
                    await page.keyboard.type(password, { delay: 100 });

                    await page.click('button[type="submit"], button:has-text("Log In")');
                    await page.waitForURL(url => url.toString().includes("reddit.com") && !url.toString().includes("login"), { timeout: 90000 });

                    // Allow session to sync, then save to DB
                    console.log(`[DISCOVERY] Login success for @${username}. Saving session to DB...`);
                    await page.waitForTimeout(3000);

                    // ✅ Save cookies to database (survives Render redeploys)
                    await saveCookiesToDb(selectedAccount.id, context!);

                    // Final Verification
                    const verified = await verifySession(username);
                    if (!verified) throw new Error("API verification failed after login");
                    console.log(`[DISCOVERY] Login successful for @${username}.`);
                } catch (loginErr: any) {
                    console.error(`[DISCOVERY] Login/Verification failed for @${username}:`, loginErr.message);
                    throw new Error(`Critical login failure for @${username}. Cannot proceed with authenticated scan.`);
                }
            } else {
                console.log(`[DISCOVERY] Active session found and verified for @${username}.`);
            }

            // --- Auto-Refresh Stats during Discovery ---
            try {
                console.log(`[DISCOVERY] Auto-refreshing stats for @${username}...`);
                const stats = await fetchRedditProfileStats(page);
                if (stats) {
                    await prisma.redditAccount.update({
                        where: { id: selectedAccount.id },
                        data: {
                            karma: stats.karma,
                            accountAge: stats.ageDays,
                            // ❌ DO NOT update status here — preserves 'discovering' state
                            updatedAt: new Date()
                        }
                    });
                    console.log(`[DISCOVERY] Stats updated for @${username}: ${stats.karma} Karma, ${stats.ageDays} Days.`);
                }
            } catch (statsErr) {
                console.error(`[DISCOVERY] Auto-refresh stats failed for @${username}:`, statsErr);
            }
            // --------------------------------------------

            await page.goto("about:blank").catch(() => { });
        } else {
            console.log("[DISCOVERY] No account selected. Falling back to public Reddit API.");
        }

        // Helper to process a single post immediately (Live Scoring & Instant Reply)
        const processPost = async (post: DiscoveredPost) => {
            if (replyPosted) return;
            totalScanned++;

            const postTitle = post.title.substring(0, 50);
            console.log(`[DISCOVERY] ${totalScanned}. Checking: "${postTitle}..." (r/${post.subreddit})`);

            // 1. Deduplication
            if (await redis.isDuplicate(`processed_posts:${projectId}`, post.redditId)) {
                console.log(`  └─ ⏭️ Skipping: Already processed.`);
                return;
            }
            const exists = await prisma.lead.findUnique({ where: { redditId: post.redditId } });
            if (exists && exists.status !== "ignored") {
                console.log(`  └─ ⏭️ Skipping: Lead already exists in DB.`);
                await redis.markProcessed(`processed_posts:${projectId}`, post.redditId);
                return;
            }

            // 2. Keyword Filter (Flexible)
            // Relaxed for Phase A (targeted subreddits) - let AI judge more
            const isTargetedSub = targetSubs.includes(post.subreddit);
            const hasMatch = hasKeywordOverlap(post, keywords);

            if (!hasMatch && !isTargetedSub) {
                console.log(`  └─ ⏭️ Skipping: No keyword match.`);
                await prisma.lead.upsert({
                    where: { redditId: post.redditId },
                    update: { status: "ignored" },
                    create: {
                        redditId: post.redditId,
                        title: post.title,
                        content: post.content.substring(0, 1000),
                        author: post.author,
                        subreddit: post.subreddit,
                        url: post.url,
                        relevanceScore: 0,
                        projectId: projectId,
                        status: "ignored"
                    }
                }).catch(() => { });
                await redis.markProcessed(`processed_posts:${projectId}`, post.redditId);
                return;
            }

            // 3. Live AI Scoring (Fast & Individual)
            console.log(`  └─ 🤖 Scoring with AI...`);
            const scoringResults = await batchAnalyzeRelevance([post], keywords, project.websiteDescription);
            const { score, intent, analysis } = scoringResults[0] || { score: 1, intent: "researching", analysis: "Direct match" };

            console.log(`  └─ 📊 Result: ${score}/10 | Intent: ${intent} | Analysis: ${analysis.substring(0, 60)}`);

            // Save lead
            const leadStatus = score >= 5 ? "new" : "ignored";
            await prisma.lead.upsert({
                where: { redditId: post.redditId },
                update: { relevanceScore: score, status: leadStatus, aiAnalysis: analysis },
                create: {
                    redditId: post.redditId,
                    title: post.title,
                    content: post.content.substring(0, 1000),
                    author: post.author,
                    subreddit: post.subreddit,
                    url: post.url,
                    relevanceScore: score,
                    aiAnalysis: analysis,
                    projectId: projectId,
                    status: leadStatus
                }
            }).catch(() => { });

            await redis.markProcessed(`processed_posts:${projectId}`, post.redditId);

            // 4. Instant Reply (Sniper Mode)
            if ((score >= 5 || debugMode) && context) {
                console.log(`[INSTANT REPLY] 🎯 Target found (Score: ${score}). Generating reply...`);

                // Construct the reply prompt
                const websiteId = project.websiteUrl || "the website";
                const brandName = project.name || "our solution";

                let mentionInstruction = "";
                if (project.mentionType === "Brand") {
                    mentionInstruction = `Mention our brand name "${brandName}" naturally. Do NOT include a URL.`;
                } else if (project.mentionType === "Both") {
                    mentionInstruction = `Mention our brand name "${brandName}" and include the URL: ${project.websiteUrl || ""}.`;
                } else {
                    mentionInstruction = `Include the website URL naturally: ${project.websiteUrl || ""}.`;
                }

                const replyPrompt = `
    Write a ${project.replyTone || "helpful"}, human-like Reddit reply to this post: "${post.title}".
    
    Post Content: ${post.content.substring(0, 800)}
    Detected Intent: ${intent.toUpperCase()}
    Our Product/Solution: ${project.websiteDescription || project.description}

    Rules for a Great Reply:
    1. Acknowledge the user's specific problem or question first to show you've read it.
    2. CONTEXTUAL RELEVANCY: Create a logical bridge between their struggle and our solution. Explicitly explain WHY you are recommending it (e.g., "Since you're having trouble with X, this tool might help because it does Y").
    3. ${mentionInstruction}
    4. Sound like a helpful peer or expert, NOT a marketer. Use natural sentence structures. Avoid "check out our site" or "visit us".
    5. Max 2-3 sentences. No hashtags.
    6. If the project description doesn't solve their specific problem, be helpful anyway without forcing a mention.
    `;


                const replyText = await askGemini(replyPrompt) || generateFallbackReply({ ...post, score, intent, analysis }, project);

                if (replyText) {
                    console.log(`[INSTANT REPLY] Posting to r/${post.subreddit}: "${replyText.substring(0, 80)}..."`);
                    const replyPage = await context.newPage();
                    const { joinAndComment } = require("./reddit-actions");
                    const success = await joinAndComment(replyPage, post.url, replyText);

                    if (success) {
                        console.log(`[INSTANT REPLY] ✅ Success! Sniper scan complete.`);
                        await prisma.lead.updateMany({
                            where: { redditId: post.redditId },
                            data: { status: "replied" }
                        }).catch(() => { });
                        replyPosted = true;
                    }
                    await replyPage.close();
                }
            }
        };

        // 1. Fetch & Process (Phase A: Subreddits)
        const targetSubsRaw = project.targetSubreddits;
        let targetSubs: string[] = [];
        try {
            if (targetSubsRaw) targetSubs = JSON.parse(targetSubsRaw);
        } catch (e) { }

        console.log(`[DISCOVERY] Targeting ${targetSubs.length} subreddits...`);

        // Phase A: Niche Scanning (SEARCH within specific subreddits)
        if (context && targetSubs.length > 0) {
            for (const sub of targetSubs) {
                if (replyPosted) break;
                console.log(`[NICHE SCAN] 🔎 Searching keywords inside r/${sub}...`);

                // Combine keywords for a broad search within the sub
                const searchQ = keywords.join(" OR ");
                const page = await context.newPage();
                const posts = await fetchRedditPostsBrowser(page, searchQ, sub);
                await page.close();

                console.log(`[NICHE SCAN] Found ${posts.length} raw posts in r/${sub} matching keywords.`);
                for (const post of posts) {
                    if (replyPosted) break;
                    await processPost(post);
                }
            }
        }

        // 2. Fetch & Process (Phase B: Global Search)
        if (!replyPosted) {
            console.log(`[DISCOVERY] 🔎 No reply posted yet. Expanding with Global Search...`);
            const queries = await generateSearchQueries(keywords);
            for (const query of queries.slice(0, 8)) {
                if (replyPosted) break;
                console.log(`[GLOBAL SEARCH] Query: "${query}"`);

                let posts: DiscoveredPost[] = [];
                if (context) {
                    const page = await context.newPage();
                    posts = await fetchRedditPostsBrowser(page, query);
                    await page.close();
                } else {
                    posts = await fetchRedditPosts(query);
                }

                console.log(`[GLOBAL SEARCH] Found ${posts.length} raw posts for this query.`);
                for (const post of posts) {
                    if (replyPosted) break;
                    await processPost(post);
                }
            }
        }

        if (!replyPosted) {
            console.log(`[DISCOVERY] Finalized scan. No suitable posts found for reply this time.`);
        }

        return { leadsFound: replyPosted ? 1 : 0, totalScanned };

    } catch (error: any) {
        console.error("[DISCOVERY FATAL ERROR]", error);
        throw error;
    } finally {
        if (context) {
            console.log("[DISCOVERY] Finalizing and closing browser context...");
            await context.close().catch(() => { });
        }
    }
}

