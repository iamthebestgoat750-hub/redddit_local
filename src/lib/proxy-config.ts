/**
 * Parses PROXY_URL env variable into a Playwright-compatible proxy config.
 * Set DISABLE_PROXY=true in .env to turn off proxy without removing the URL.
 */
export function getPlaywrightProxy(): { server: string; username?: string; password?: string } | undefined {
    if (process.env.DISABLE_PROXY === "true") return undefined;
    const raw = process.env.PROXY_URL;
    if (!raw) return undefined;

    try {
        const url = new URL(raw);
        const server = `${url.protocol}//${url.hostname}:${url.port}`;
        const username = url.username ? decodeURIComponent(url.username) : undefined;
        const password = url.password ? decodeURIComponent(url.password) : undefined;
        return { server, username, password };
    } catch {
        return { server: raw };
    }
}
