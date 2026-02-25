import { Page } from "playwright";

/**
 * Adds a log entry to the browser console for visibility
 */
export async function addBrowserLog(page: Page, message: string) {
    try {
        await page.evaluate((msg) => console.log(`[BOT] ${msg}`), message);
        console.log(`[BROWSER ACTION] ${message}`);
    } catch (e) { }
}

// Shadow-DOM piercing helpers injected into the browser page (plain JS - NO TypeScript types!)
const shadowHelpers = () => {
    (window as any).__findDeep = function findDeep(root: any, selector: any): any[] {
        var elements: any[] = Array.from(root.querySelectorAll(selector));
        var children: any[] = Array.from(root.querySelectorAll('*'));
        for (var i = 0; i < children.length; i++) {
            var child: any = children[i];
            if (child.shadowRoot) {
                elements = elements.concat((window as any).__findDeep(child.shadowRoot, selector));
            }
        }
        return elements;
    };
    (window as any).__findFirstDeep = function findFirstDeep(root: any, selector: any): any {
        var found = root.querySelector(selector);
        if (found) return found;
        var children: any[] = Array.from(root.querySelectorAll('*'));
        for (var i = 0; i < children.length; i++) {
            var child: any = children[i];
            if (child.shadowRoot) {
                var deepFound = (window as any).__findFirstDeep(child.shadowRoot, selector);
                if (deepFound) return deepFound;
            }
        }
        return null;
    };
};

/**
 * Upvotes the post at the current page URL using Reddit's vote API.
 * Since the browser has an active session, fetch() uses session cookies automatically.
 * This is far more reliable than clicking DOM buttons in shadow roots.
 */
export async function upvotePost(page: Page): Promise<boolean> {
    try {
        await page.waitForTimeout(1500);

        const currentUrl = page.url();

        // Extract post ID from URL like /r/sub/comments/POST_ID/...
        const postIdMatch = currentUrl.match(/\/comments\/([a-z0-9]+)\//i);
        const postId = postIdMatch ? postIdMatch[1] : null;

        if (postId) {
            // Strategy 1: Reddit API vote — uses browser session cookies directly
            addBrowserLog(page, `Voting via API for post t3_${postId}...`);

            const apiResult = await page.evaluate(async (pid: string) => {
                try {
                    // Get modhash (Reddit's CSRF token) from the page or from /api/me.json
                    let modhash = (window as any).r?.config?.modhash || '';
                    if (!modhash) {
                        const meRes = await fetch('https://www.reddit.com/api/me.json', {
                            credentials: 'include',
                            headers: { 'Accept': 'application/json' }
                        });
                        if (meRes.ok) {
                            const meData = await meRes.json();
                            modhash = meData?.data?.modhash || '';
                        }
                    }

                    const body = new URLSearchParams({
                        dir: '1',
                        id: `t3_${pid}`,
                        modhash: modhash,
                        rank: '1'
                    });

                    const res = await fetch('https://www.reddit.com/api/vote', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-Modhash': modhash
                        },
                        body: body.toString()
                    });

                    if (res.ok) return { success: true, status: res.status };
                    return { success: false, status: res.status };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }, postId);

            if ((apiResult as any)?.success) {
                addBrowserLog(page, `⬆️ Upvoted via API (HTTP ${(apiResult as any).status})`);
                return true;
            }
            addBrowserLog(page, `API vote response: ${JSON.stringify(apiResult)}`);
        }

        const upvoteSelectors = [
            '[aria-label="Upvote"]',
            '[aria-label="upvote"]',
            'button[name="upvote-button"]',
            '[data-click-id="upvote"]',
            'button[aria-label*="pvo" i]',
        ];

        async function verifyUpvoted(): Promise<boolean> {
            await page.waitForTimeout(1000);
            for (const sel of upvoteSelectors) {
                try {
                    const pressed = await page.locator(sel).first().getAttribute('aria-pressed', { timeout: 1000 });
                    if (pressed === 'true') return true;
                } catch { }
            }
            return false;
        }

        if (postId) {
            // Strategy 2: Reddit API vote (retry)
            addBrowserLog(page, `Voting via API for post t3_${postId}...`);
            const apiResult2 = await page.evaluate(async (pid: string) => {
                try {
                    let modhash = (window as any).r?.config?.modhash || '';
                    if (!modhash) {
                        const meRes = await fetch('https://www.reddit.com/api/me.json', { credentials: 'include' });
                        if (meRes.ok) {
                            const meData = await meRes.json();
                            modhash = meData?.data?.modhash || '';
                        }
                    }
                    const res = await fetch('https://www.reddit.com/api/vote', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Modhash': modhash },
                        body: new URLSearchParams({ dir: '1', id: `t3_${pid}`, modhash: modhash, rank: '1' }).toString()
                    });
                    return { success: res.ok, status: res.status };
                } catch (e: any) { return { success: false, error: e.message }; }
            }, postId);

            if ((apiResult2 as any)?.success) {
                if (await verifyUpvoted()) {
                    addBrowserLog(page, `⬆️ Upvoted via API (Verified)`);
                    return true;
                }
                addBrowserLog(page, `API call returned OK, but UI did not update. Retrying via DOM...`);
            }
        }

        // Strategy 3: DOM click
        addBrowserLog(page, 'Trying DOM click...');
        for (const sel of upvoteSelectors) {
            try {
                const loc = page.locator(sel).first();
                if (await loc.isVisible({ timeout: 1000 })) {
                    await loc.scrollIntoViewIfNeeded();
                    await loc.click({ force: true });
                    if (await verifyUpvoted()) {
                        addBrowserLog(page, `⬆️ Upvoted via DOM (Verified)`);
                        return true;
                    }
                }
            } catch { }
        }

        // Strategy 4: Keyboard shortcut 'a'
        addBrowserLog(page, 'Trying keyboard shortcut (a)...');
        await page.keyboard.press('a');
        if (await verifyUpvoted()) {
            addBrowserLog(page, '⬆️ Upvoted via Keyboard (Verified)');
            return true;
        }

        addBrowserLog(page, '❌ Upvote failed verification after all strategies.');
        await page.screenshot({ path: `upvote-failed-${Date.now()}.png` });
        return false;

    } catch (err) {
        addBrowserLog(page, `Upvote error: ${(err as Error).message}`);
        return false;
    }
}


/**
 * Ensures the bot has joined a subreddit community.
 */
export async function ensureJoinedCommunity(page: Page, subreddit: string): Promise<boolean> {
    try {
        const cleanSub = subreddit.startsWith('r/') ? subreddit : `r/${subreddit}`;
        const url = `https://www.reddit.com/${cleanSub}/`;
        addBrowserLog(page, `Checking join status for ${cleanSub}...`);

        if (!page.url().includes(cleanSub.replace('r/', ''))) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await page.waitForTimeout(2000);

        await page.evaluate(shadowHelpers);

        const status = await page.evaluate(() => {
            const findDeep = (window as any).__findDeep;
            const buttons = findDeep(document, 'button, faceplate-button');
            for (const btn of buttons) {
                const text = (btn.innerText || '').toLowerCase().trim();
                const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (text === 'joined' || text === 'leave' || label.includes('leave')) return 'already-joined';
                if (text === 'join' || label === 'join community' || label.includes('join')) {
                    btn.click();
                    return 'clicked-join';
                }
            }
            return 'not-found';
        });

        if (status === 'already-joined') {
            addBrowserLog(page, `✅ Already a member of ${cleanSub}.`);
            return true;
        } else if (status === 'clicked-join') {
            addBrowserLog(page, `➕ Joined ${cleanSub}!`);
            await page.waitForTimeout(2000);
            return true;
        } else {
            addBrowserLog(page, `⚠️ Join status unknown for ${cleanSub}.`);
            return true; // Continue anyway
        }
    } catch (err) {
        addBrowserLog(page, `Join error: ${(err as Error).message}`);
        return true; // Continue anyway
    }
}

/**
 * Posts a comment on a specific Reddit post URL.
 *
 * PRIMARY: Reddit API (/api/comment) — session cookie based, no DOM needed.
 * FALLBACK: Browser automation with direct keyboard typing after activation.
 *
 * Key insight for fallback:
 * After clicking Reply or "Join the conversation", the Lexical editor already
 * has FOCUS — so we type directly via page.keyboard without finding the editor.
 */
export async function joinAndComment(page: Page, postUrl: string, commentText: string): Promise<boolean> {
    try {
        addBrowserLog(page, `Navigating to: ${postUrl}`);
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Check if post is locked
        const isLocked = await page.evaluate(() => {
            const body = document.body.innerText || '';
            return body.includes('Locked post') || body.includes('Comments are locked') ||
                !!document.querySelector('[data-testid="post-locked-icon"]');
        });

        if (isLocked) {
            addBrowserLog(page, '⚠️ Post is LOCKED. Skipping...');
            return false;
        }

        // Inject shadow DOM helpers
        await page.evaluate(shadowHelpers);

        // Join community if needed
        const joinNeeded = await page.evaluate(() => {
            const buttons = (window as any).__findDeep(document, 'button, faceplate-button');
            for (const btn of buttons) {
                const text = (btn.innerText || '').toLowerCase().trim();
                if (text === 'join') { btn.click(); return true; }
            }
            return false;
        });
        if (joinNeeded) {
            addBrowserLog(page, '➕ Joined community before commenting.');
            await page.waitForTimeout(1500);
        }

        // ═══════════════════════════════════════════════════════════════
        // STRATEGY 1: Reddit API comment submission (most reliable)
        // Uses browser session cookies — completely bypasses the DOM UI.
        // ═══════════════════════════════════════════════════════════════
        addBrowserLog(page, '🚀 Attempting Reddit API comment submission...');

        const postIdMatch = postUrl.match(/\/comments\/([a-z0-9]+)\//i);
        const postId = postIdMatch ? postIdMatch[1] : null;

        if (postId) {
            const apiResult = await page.evaluate(async (params: { pid: string; text: string }) => {
                try {
                    // Get modhash (Reddit CSRF token)
                    let modhash = (window as any).r?.config?.modhash || '';
                    if (!modhash) {
                        const meRes = await fetch('https://www.reddit.com/api/me.json', {
                            credentials: 'include',
                            headers: { 'Accept': 'application/json' }
                        });
                        if (meRes.ok) {
                            const meData = await meRes.json();
                            modhash = meData?.data?.modhash || '';
                        }
                    }

                    if (!modhash) return { success: false, error: 'No modhash found' };

                    const body = new URLSearchParams({
                        api_type: 'json',
                        thing_id: `t3_${params.pid}`,
                        text: params.text,
                        modhash: modhash
                    });

                    const res = await fetch('https://www.reddit.com/api/comment', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-Modhash': modhash
                        },
                        body: body.toString()
                    });

                    const data = await res.json();

                    // Reddit returns errors in data.json.errors array
                    if (data?.json?.errors?.length > 0) {
                        return { success: false, error: data.json.errors[0][1] };
                    }

                    // Success: a comment object was returned
                    if (data?.json?.data?.things?.length > 0) {
                        return { success: true, id: data.json.data.things[0]?.data?.id };
                    }

                    return { success: res.ok, status: res.status };
                } catch (e: any) {
                    return { success: false, error: e.message };
                }
            }, { pid: postId, text: commentText });

            if ((apiResult as any)?.success) {
                addBrowserLog(page, `✅ Comment submitted via Reddit API! ID: ${(apiResult as any).id || 'ok'}`);
                return true;
            }
            addBrowserLog(page, `API result: ${JSON.stringify(apiResult)} — falling back to browser UI...`);
        }

        // ═══════════════════════════════════════════════════════════════
        // STRATEGY 2: Browser UI automation
        //
        // The KEY INSIGHT here:
        // After clicking Reply / "Join the conversation", the Lexical editor
        // already has FOCUS. We do NOT need to find the editor element.
        // Just type directly with page.keyboard — this always works.
        // ═══════════════════════════════════════════════════════════════
        addBrowserLog(page, '🖱️ Using browser UI automation...');

        // Step 2a: Click the activation button / placeholder
        // IMPORTANT: Only target the TOP-LEVEL "Join the conversation" input.
        // Do NOT click "Reply" on existing comments — that opens the wrong box.
        const activationSelectors = [
            // "Join the conversation" placeholder input (most direct)
            '[placeholder="Join the conversation"]',
            'div[data-placeholder="Join the conversation"]',
            // Shreddit composer top-level element
            'shreddit-composer',
            // Add a comment button variants
            'button:has-text("Add a comment")',
            'faceplate-button:has-text("Add a comment")',
            '[aria-label="Add a comment"]',
            // Generic "Join the conversation" button (not Reply!)
            'button:has-text("Join the conversation")',
            'faceplate-button:has-text("Join the conversation")',
        ];


        let activated = false;
        for (const sel of activationSelectors) {
            try {
                const el = page.locator(sel).first();
                if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
                    addBrowserLog(page, `Clicking activation: ${sel}`);
                    await el.scrollIntoViewIfNeeded();
                    await el.click({ force: true });
                    activated = true;
                    await page.waitForTimeout(1500);
                    break;
                }
            } catch { }
        }

        // If Playwright couldn't find it, use JS deep search
        if (!activated) {
            addBrowserLog(page, 'Playwright activation failed, trying JS deep search...');
            const jsActivateResult = await page.evaluate(() => {
                const findDeep = (window as any).__findDeep;

                // Look for placeholder elements
                const allEls = findDeep(document, '[placeholder], div[contenteditable], div[data-placeholder], shreddit-composer');
                for (const el of allEls) {
                    const placeholder = (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '').toLowerCase();
                    if (placeholder.includes('join') || placeholder.includes('conversation') || placeholder.includes('comment')) {
                        el.click();
                        el.focus();
                        return 'placeholder-clicked: ' + placeholder;
                    }
                }

                // Look for text prompts
                const textEls = findDeep(document, 'p, div, span');
                for (const el of textEls) {
                    const t = (el.textContent || '').trim().toLowerCase();
                    if (t === 'join the conversation' || t === 'add a comment' || t === 'what are your thoughts?') {
                        el.click();
                        return 'text-clicked: ' + t;
                    }
                }

                return 'not-found';
            });
            addBrowserLog(page, `JS activation result: ${jsActivateResult}`);
            await page.waitForTimeout(1500);
        }

        // Step 2b: TYPE DIRECTLY via keyboard
        // Focus is already on the editor after clicking activation.
        // Character-by-character typing is the only reliable method for Lexical.
        addBrowserLog(page, '⌨️ Typing via keyboard...');

        // Click shreddit-composer to ensure focus
        const composerVisible = await page.locator('shreddit-composer').isVisible({ timeout: 1000 }).catch(() => false);
        if (composerVisible) {
            await page.locator('shreddit-composer').click({ force: true });
            await page.waitForTimeout(400);
        }

        // Type character by character with human-like random delay (80-150ms)
        for (const char of commentText) {
            const delay = 80 + Math.floor(Math.random() * 70); // 80-150ms
            await page.keyboard.type(char, { delay });
            // Occasional longer pause (simulates thinking)
            if (Math.random() < 0.05) await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
        }

        addBrowserLog(page, '✏️ Done typing. Verifying text in editor...');
        await page.waitForTimeout(800);

        // Check if text appeared in any contenteditable
        const textInEditor = await page.evaluate((text: string) => {
            const findDeep = (window as any).__findDeep;
            const editors = findDeep(document, '[contenteditable="true"], textarea');
            return editors.some((el: any) => (el.textContent || el.value || '').includes(text.substring(0, 20)));
        }, commentText);

        if (!textInEditor) {
            addBrowserLog(page, '⚠️ Text not visible in editor, retrying with Escape + re-click...');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            // Try to click the "Join the conversation" box directly via JS
            await page.evaluate(() => {
                const allInputs = document.querySelectorAll('input, [contenteditable]');
                for (const el of Array.from(allInputs)) {
                    const placeholder = (el as HTMLElement).getAttribute('placeholder') || '';
                    if (placeholder.toLowerCase().includes('join') || placeholder.toLowerCase().includes('conversation')) {
                        (el as HTMLElement).click();
                        (el as HTMLElement).focus();
                        return;
                    }
                }
                const composer = document.querySelector('shreddit-composer');
                if (composer) (composer as HTMLElement).click();
            });
            await page.waitForTimeout(800);

            // Re-type with human-like delay
            for (const char of commentText) {
                const delay = 80 + Math.floor(Math.random() * 70);
                await page.keyboard.type(char, { delay });
                if (Math.random() < 0.05) await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
            }
            await page.waitForTimeout(800);
        } else {
            addBrowserLog(page, '✅ Text confirmed in editor!');
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Submit the comment
        // ═══════════════════════════════════════════════════════════════
        addBrowserLog(page, '📤 Submitting comment...');

        const submitSelectors = [
            'shreddit-composer button[type="submit"]',
            'shreddit-composer faceplate-button[slot="submit-button"]',
            'button:has-text("Comment")',
            'button:has-text("Reply")',
            'faceplate-button:has-text("Comment")',
            'faceplate-button:has-text("Reply")',
            '[slot="submit-button"]',
            'button[type="submit"]',
        ];

        let submitted = false;
        for (const sel of submitSelectors) {
            try {
                // Use .last() to avoid clicking Reply activation buttons on existing comments
                const loc = page.locator(sel).last();
                const visible = await loc.isVisible({ timeout: 1500 }).catch(() => false);
                const disabled = await loc.getAttribute('disabled').catch(() => null);

                if (visible && disabled === null) {
                    addBrowserLog(page, `Clicking submit: ${sel}`);
                    await loc.click({ force: true });
                    submitted = true;
                    break;
                }
            } catch { }
        }

        // JS deep submit fallback
        if (!submitted) {
            const jsResult = await page.evaluate(() => {
                const findDeep = (window as any).__findDeep;
                const buttons = findDeep(document, 'button, faceplate-button');

                for (const btn of buttons) {
                    const text = (btn.innerText || btn.textContent || '').toLowerCase().trim();
                    const slot = btn.getAttribute('slot') || '';
                    const type = btn.getAttribute('type') || '';
                    const isDisabled = btn.disabled || btn.getAttribute('disabled') !== null;

                    if (isDisabled) continue;
                    if (text === 'cancel' || text === 'close' || text === 'discard') continue;

                    // Skip Reply buttons in comment action rows (they are activation, not submit)
                    if (btn.closest('shreddit-comment-action-row') && text === 'reply') continue;

                    if (slot === 'submit-button' || type === 'submit' ||
                        text === 'comment' ||
                        (text === 'reply' && !btn.closest('shreddit-comment-action-row'))) {
                        btn.scrollIntoView({ block: 'center' });
                        btn.click();
                        return `clicked: ${text || slot || type}`;
                    }
                }
                return null;
            });

            if (jsResult) {
                addBrowserLog(page, `✅ Submitted via JS: ${jsResult}`);
                submitted = true;
            }
        }

        // Final fallback: Ctrl+Enter
        if (!submitted) {
            addBrowserLog(page, '⌨️ Trying Ctrl+Enter...');
            await page.keyboard.press('Control+Enter');
            submitted = true;
        }

        await page.waitForTimeout(6000);

        // Verification 1: Did the composer disappear? (means it posted)
        const composerGone = await page.evaluate(() => {
            const composer = document.querySelector('shreddit-composer');
            if (!composer) return true;
            return composer.getBoundingClientRect().height < 5;
        });

        if (composerGone) {
            addBrowserLog(page, '✅ Comment submitted! (Composer closed = success)');
            return true;
        }

        // Verification 2: Check if comment text appears in DOM
        const commentInDom = await page.evaluate((text: string) => {
            const findDeep = (window as any).__findDeep;
            const areas = findDeep(document, 'shreddit-comment, .Comment p, [data-testid="comment-body"]');
            return areas.some((el: any) => (el.textContent || '').includes(text.substring(0, 30)));
        }, commentText);

        if (commentInDom) {
            addBrowserLog(page, '✅ Comment verified in DOM!');
            return true;
        }

        addBrowserLog(page, '❌ Comment submission uncertain. Taking screenshot...');
        await page.screenshot({ path: `comment-debug-${Date.now()}.png` });
        return false;

    } catch (error: any) {
        console.error('joinAndComment error:', error);
        addBrowserLog(page, `CRITICAL ERROR: ${error.message}`);
        return false;
    }
}

/**
 * Scrapes karma and account age from the current user's profile.
 */
export async function fetchRedditProfileStats(page: Page): Promise<{ karma: number; ageDays: number; status?: string } | null> {
    try {
        addBrowserLog(page, 'Navigating to resolve username...');
        await page.goto('https://www.reddit.com/user/me', { waitUntil: 'domcontentloaded', timeout: 60000 });
        const url = page.url();
        const usernameMatch = url.match(/\/user\/([^/]+)/);
        const username = usernameMatch ? usernameMatch[1] : null;

        if (username && !username.includes('me')) {
            addBrowserLog(page, `Username resolved: ${username}. Fetching JSON...`);
            try {
                const aboutJson = await page.evaluate(async (uname: string) => {
                    const res = await fetch(`https://www.reddit.com/user/${uname}/about.json`).catch(() => null);
                    if (!res || !res.ok) return null;
                    const json = await res.json();
                    return json.data;
                }, username);

                if (aboutJson && aboutJson.created_utc) {
                    const createdTs = aboutJson.created_utc * 1000;
                    const diff = Date.now() - createdTs;
                    const exactDays = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const totalKarma = (aboutJson.link_karma || 0) + (aboutJson.comment_karma || 0);
                    addBrowserLog(page, `✅ Stats: ${totalKarma} Karma, ${exactDays} Days.`);
                    return { karma: totalKarma, ageDays: exactDays, status: 'active' };
                }
            } catch (jsonErr) {
                addBrowserLog(page, 'JSON fetch failed, using scraper fallback.');
            }
        }

        addBrowserLog(page, 'Falling back to profile scraping...');
        if (!page.url().includes('/user/')) {
            await page.goto(`https://www.reddit.com/user/${username}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        const stats = await page.evaluate(() => {
            const karmaEl = document.querySelector('[id*="karma"], [data-testid*="karma"]');
            const karmaText = karmaEl ? karmaEl.textContent || '0' : '0';
            const karma = parseInt(karmaText.replace(/[^0-9]/g, ''), 10) || 0;
            return { karma, ageDays: 0, status: 'active' };
        });

        return stats;
    } catch (err) {
        addBrowserLog(page, `Profile stats error: ${(err as Error).message}`);
        return null;
    }
}
