/**
 * Stealth-enabled browser launcher using playwright-extra.
 * Replaces plain `chromium` from playwright to avoid bot detection.
 * Supports per-account persistent fingerprints (UA + viewport).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium: stealthChromium } = require("playwright-extra");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("playwright-extra-plugin-stealth");
import type { BrowserContext } from "playwright";

// Apply stealth plugin once
stealthChromium.use(StealthPlugin());

// ── Fingerprint types ────────────────────────────────────────────────────────

export interface BrowserFingerprint {
    userAgent: string;
    viewport: { width: number; height: number };
    screenSize: { width: number; height: number };
    chromeVersion: string;
}

// ── Fingerprint pool ─────────────────────────────────────────────────────────

const CHROME_VERSIONS = ["131.0.0.0", "132.0.0.0", "133.0.0.0"];

const WINDOWS_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
];

const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a new random browser fingerprint.
 * Call once per account and persist in DB.
 */
export function generateFingerprint(): BrowserFingerprint {
    const ua = pick(WINDOWS_UAS);
    const viewport = pick(VIEWPORTS);
    const chromeVersionMatch = ua.match(/Chrome\/([\d.]+)/);
    const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : pick(CHROME_VERSIONS);
    return {
        userAgent: ua,
        viewport,
        screenSize: { width: viewport.width, height: viewport.height + 40 }, // +40 for taskbar
        chromeVersion,
    };
}

/**
 * Parse a fingerprint from a JSON string stored in DB.
 * Falls back to generating a new one if invalid.
 */
export function parseFingerprintFromDb(json: string | null | undefined): BrowserFingerprint {
    if (!json) return generateFingerprint();
    try {
        return JSON.parse(json) as BrowserFingerprint;
    } catch {
        return generateFingerprint();
    }
}

// ── Browser launcher ─────────────────────────────────────────────────────────

export interface StealthLaunchOptions {
    headless?: boolean;
    slowMo?: number;
    proxy?: { server: string; username?: string; password?: string } | null;
    fingerprint?: BrowserFingerprint;
    args?: string[];
}

/**
 * Launch a stealth-patched persistent browser context with a given fingerprint.
 * Fingerprint should be loaded from DB (or generated once and saved).
 */
export async function launchStealthContext(
    sessionPath: string,
    options: StealthLaunchOptions = {}
): Promise<BrowserContext> {
    const { proxy, fingerprint: fp, args: extraArgs, ...rest } = options;
    const fingerprint = fp ?? generateFingerprint();

    return stealthChromium.launchPersistentContext(sessionPath, {
        headless: true,
        ...rest,
        proxy: proxy ?? undefined,
        userAgent: fingerprint.userAgent,
        viewport: fingerprint.viewport,
        screen: fingerprint.screenSize,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            ...(extraArgs ?? []),
        ],
    }) as Promise<BrowserContext>;
}
