/**
 * Fetches public Reddit profile stats (karma and account age) 
 * WITHOUT needing a browser or login. 
 * This uses the public .json endpoint which is extremely fast.
 */
export async function fetchPublicRedditStats(username: string): Promise<{ karma: number; ageDays: number } | null> {
    try {
        // Reddit's public API for user profiles
        const response = await fetch(`https://www.reddit.com/user/${username}/about.json`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            next: { revalidate: 3600 } // Cache for 1 hour if using Next.js cache
        });

        if (!response.ok) {
            console.error(`[PUBLIC API] Failed to fetch stats for @${username}: ${response.status}`);
            return null;
        }

        const json = await response.json();
        const data = json.data;

        if (!data || !data.created_utc) {
            return null;
        }

        const createdTs = data.created_utc * 1000;
        const currentTs = Date.now();
        const ageDays = Math.floor((currentTs - createdTs) / (1000 * 60 * 60 * 24));

        // Total Karma = Link Karma + Comment Karma
        const totalKarma = (data.link_karma || 0) + (data.comment_karma || 0);

        return {
            karma: totalKarma,
            ageDays: ageDays
        };
    } catch (error: any) {
        console.error(`[PUBLIC API] Error fetching stats for @${username}:`, error.message);
        return null;
    }
}
