/**
 * Parses PROXY_URL env variable into a Playwright-compatible proxy config.
 * Handles HTTP, HTTPS, and SOCKS5 proxies with embedded credentials.
 *
 * Example input:  socks5://user:pass@host:port
 * Example output: { server: "socks5://host:port", username: "user", password: "pass" }
 */
export function getPlaywrightProxy(): { server: string; username?: string; password?: string } | undefined {
    const raw = process.env.PROXY_URL;
    if (!raw) return undefined;

    try {
        const url = new URL(raw);
        const server = `${url.protocol}//${url.hostname}:${url.port}`;
        const username = url.username ? decodeURIComponent(url.username) : undefined;
        const password = url.password ? decodeURIComponent(url.password) : undefined;
        return { server, username, password };
    } catch {
        // fallback: pass raw string, hope for the best
        return { server: raw };
    }
}
