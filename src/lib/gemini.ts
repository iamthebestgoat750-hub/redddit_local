import { GoogleGenerativeAI } from "@google/generative-ai";
import { askGroq } from "./groq";
import { askCerebras } from "./cerebras";

/**
 * Gemini AI with per-key rate limit tracking.
 * If Key 1 is rate-limited → immediately tries Key 2, Key 3, etc.
 */

const API_KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
    process.env.GEMINI_API_KEY_8,
    process.env.GEMINI_API_KEY_9,
    process.env.GEMINI_API_KEY_10,
].filter(Boolean) as string[];

const UNIQUE_KEYS = [...new Set(API_KEYS)];

const MODELS_TO_TRY = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
];

// Per-key rate limit timestamp (if set, skip that key until cooldown expires)
const keyRateLimitedUntil: number[] = UNIQUE_KEYS.map(() => 0);

function extractRetryDelay(errorMsg: string): number {
    const match = errorMsg.match(/retryDelay.*?(\d+)/);
    return match ? parseInt(match[1]) : 60;
}

export async function askGemini(prompt: string, systemInstruction?: string): Promise<string | undefined> {
    // LEVEL 1: Groq (Primary - 14,400 calls/day FREE)
    const groqResult = await askGroq(prompt, systemInstruction);
    if (groqResult) return groqResult;
    console.warn("[AI] Groq unavailable. Trying Gemini keys...");

    if (UNIQUE_KEYS.length === 0) {
        console.error("[AI] No Gemini API keys found. Add GEMINI_API_KEY to .env");
        return undefined;
    }

    const now = Date.now();

    for (let i = 0; i < UNIQUE_KEYS.length; i++) {
        const apiKey = UNIQUE_KEYS[i];

        // Skip keys that are still in rate-limit cooldown
        if (keyRateLimitedUntil[i] > now) {
            const secsLeft = Math.ceil((keyRateLimitedUntil[i] - now) / 1000);
            console.warn(`[AI] Key ${i + 1} is rate-limited (${secsLeft}s left). Trying next key...`);
            continue;
        }

        for (const modelName of MODELS_TO_TRY) {
            try {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
                const result = await model.generateContent(prompt);
                return result.response.text();
            } catch (error: any) {
                const errorMsg = error.message || "";

                if (errorMsg.includes("404") || errorMsg.includes("not found")) {
                    console.warn(`[AI] Key ${i + 1}: Model ${modelName} not found. Trying next model...`);
                    continue;
                }

                if (errorMsg.includes("429")) {
                    const delaySec = extractRetryDelay(errorMsg);
                    keyRateLimitedUntil[i] = Date.now() + (delaySec + 5) * 1000;
                    console.warn(`[AI] Key ${i + 1} rate-limited for ${delaySec}s. Switching to next key...`);
                    break;
                }

                if (errorMsg.includes("quota") || errorMsg.includes("tier")) {
                    console.error(`[AI] Key ${i + 1} QUOTA ERROR: ${errorMsg.substring(0, 100)}`);
                    keyRateLimitedUntil[i] = Date.now() + 3600 * 1000; // Skip for 1 hour
                    break;
                }

                console.error(`[AI ERROR] Key ${i + 1} failed with ${modelName}:`, errorMsg.substring(0, 150));
                break;
            }
        }
    }

    console.warn(`[AI] All ${UNIQUE_KEYS.length} Gemini keys exhausted. Trying Cerebras (Level 3)...`);

    // LEVEL 3: Cerebras (Last AI Fallback)
    const cerebrasResult = await askCerebras(prompt, systemInstruction);
    if (cerebrasResult) return cerebrasResult;

    console.error(`[AI] All AI options (Groq + Gemini + Cerebras) exhausted. Using keyword fallback.`);
    return undefined;
}
