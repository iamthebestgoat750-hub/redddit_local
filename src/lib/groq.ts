/**
 * Groq AI Client - Primary AI (14,400 requests/day FREE)
 * Uses OpenAI-compatible API via fetch.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function askGroq(prompt: string, systemInstruction?: string): Promise<string | undefined> {
    if (!GROQ_API_KEY) {
        console.warn("[GROQ] No API key found in .env");
        return undefined;
    }

    try {
        console.log("[AI] 🚀 Calling Groq (Primary AI)...");
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
            }),
        });

        if (response.status === 429) {
            console.warn("[GROQ] Rate limit hit. Switching to Gemini fallback...");
            return undefined;
        }

        if (!response.ok) {
            const err = await response.text();
            console.error("[GROQ ERROR]", response.status, err.substring(0, 100));
            return undefined;
        }

        const data = await response.json();
        return data.choices[0]?.message?.content;
    } catch (error: any) {
        console.error("[GROQ ERROR]", error?.message?.substring(0, 100));
        return undefined;
    }
}
