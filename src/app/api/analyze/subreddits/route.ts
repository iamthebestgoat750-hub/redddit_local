import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { askGemini } from "@/lib/gemini";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { keywords } = await req.json();
        if (!keywords || !Array.isArray(keywords)) {
            return NextResponse.json({ error: "Keywords array is required" }, { status: 400 });
        }

        const prompt = `
        I have a product/website related to these keywords: ${keywords.join(", ")}.
        
        Find 15-20 relevant subreddits where people discuss these topics.
        Include a mix of:
        1. Direct niche communities (e.g. r/python for coding tools).
        2. Help/Ask communities (e.g. r/askreddit, r/howtobye).
        3. Industry/Business communities (e.g. r/startup, r/entrepreneur).

        Rules:
        - Only return active, real subreddits.
        - Avoid subreddits that are strictly anti-promotion if possible.
        - Return ONLY a JSON array of strings (the names of the subreddits).
        `;

        const aiResponse = await askGemini(prompt);
        if (!aiResponse) throw new Error("AI failed to find subreddits");

        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("Invalid AI response format");

        const subreddits = JSON.parse(jsonMatch[0]).map((s: string) => s.replace("r/", "").trim());

        return NextResponse.json({ success: true, subreddits });

    } catch (error: any) {
        console.error("[SUBREDDIT DISCOVERY ERROR]", error);
        return NextResponse.json({ error: "Failed to find subreddits", details: error.message }, { status: 500 });
    }
}
