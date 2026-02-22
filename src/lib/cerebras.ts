
/**
 * Cerebras AI Fallback Client
 * Uses OpenAI-compatible API via fetch.
 */

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

export async function askCerebras(prompt: string, systemInstruction?: string): Promise<string | undefined> {
    if (!CEREBRAS_API_KEY) {
        console.warn("[CEREBRAS] No API key found in .env");
        return undefined;
    }

    try {
        console.log("[AI] ⚡ Calling Cerebras fallback...");
        const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CEREBRAS_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama3.1-70b", // Cerebras supports Llama models
                messages: [
                    ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("[CEREBRAS ERROR]", response.status, err);
            return undefined;
        }

        const data = await response.json();
        return data.choices[0]?.message?.content;
    } catch (error) {
        console.error("[CEREBRAS ERROR]", error);
        return undefined;
    }
}
