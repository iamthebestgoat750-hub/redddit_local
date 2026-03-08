/**
 * Stealth-enabled browser launcher using playwright-extra.
 * Replaces plain `chromium` from playwright to avoid bot detection.
 * Supports per-account persistent fingerprints (UA + viewport).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium: stealthChromium } = require("playwright-extra");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
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
    extensionPaths?: string[]; // Local paths to unpacked Chrome extensions
}

/**
 * Launch a stealth-patched persistent browser context with a given fingerprint.
 * Fingerprint should be loaded from DB (or generated once and saved).
 *
 * NOTE: Chrome extensions require headless:false to work.
 */
/**
 * Validate extension paths — ALL paths must have a manifest.json.
 * Throws an error if any extension is broken so the bot stops immediately.
 */
function validateExtensionPaths(paths: string[]): string[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    for (const p of paths) {
        const manifest = path.join(p, "manifest.json");
        if (!fs.existsSync(manifest)) {
            throw new Error(
                `❌ Extension not found — manifest missing at:\n${manifest}\n\nFix CHROME_EXTENSIONS in .env and restart.`
            );
        }
    }
    return paths;
}

export async function launchStealthContext(
    sessionPath: string,
    options: StealthLaunchOptions = {}
): Promise<BrowserContext> {
    const { proxy, fingerprint: fp, args: extraArgs, extensionPaths: rawPaths, ...rest } = options;
    const fingerprint = fp ?? generateFingerprint();

    // Validate extension paths — skip any with missing manifest
    const validPaths = rawPaths && rawPaths.length > 0 ? validateExtensionPaths(rawPaths) : [];

    // Build extension args if we have valid paths
    const extensionArgs: string[] = [];
    if (validPaths.length > 0) {
        const paths = validPaths.join(",");
        extensionArgs.push(
            `--load-extension=${paths}`,
            `--disable-extensions-except=${paths}`,
        );
        if (rest.headless !== false) {
            console.log("[STEALTH] Extensions loaded — browser opens minimized (do NOT close it).");
            rest.headless = false;
            extensionArgs.push("--start-minimized");
        }
    }

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
            "--ignore-extension-errors",   // Don't crash on bad extension
            ...extensionArgs,
            ...(extraArgs ?? []),
        ],
    }) as Promise<BrowserContext>;
}
