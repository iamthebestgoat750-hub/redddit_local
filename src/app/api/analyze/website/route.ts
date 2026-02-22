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
        const { url } = await req.json();
        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Validate URL format
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        } catch {
            return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
        }

        console.log(`[ANALYSIS] Fetching website: ${parsedUrl.href}`);

        // Use fetch instead of Playwright — faster & no DNS crash
        let pageText = '';
        let pageTitle = parsedUrl.hostname;
        let metaDesc = '';

        try {
            const response = await fetch(parsedUrl.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            // Extract title
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) pageTitle = titleMatch[1].trim();

            // Extract meta description
            const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
            if (metaMatch) metaDesc = metaMatch[1].trim();

            // Extract body text (strip tags)
            pageText = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 3000);

        } catch (fetchError: any) {
            console.error(`[ANALYSIS] Fetch failed: ${fetchError.message}. Using URL-based analysis.`);
            // If we can't fetch, analyze based on the URL/domain alone
            pageTitle = parsedUrl.hostname.replace('www.', '');
            pageText = `Website: ${parsedUrl.href}. Domain: ${parsedUrl.hostname}.`;
        }

        const prompt = `
        Analyze this website and provide discovery data for a Reddit marketing bot.
        
        Website URL: ${parsedUrl.href}
        Title: ${pageTitle}
        Meta Description: ${metaDesc}
        Content: ${pageText || 'Content not available — analyze based on domain name.'}
        
        Provide:
        1. A clean 300-500 character description of what this product/service does.
        2. A list of 10 relevant keywords Reddit users would use when looking for this type of product.
        3. The top 5 most important keywords from that list.
        
        Return ONLY a valid JSON object (no markdown, no extra text):
        {
            "description": "string",
            "keywords": ["string", "string", "string", "string", "string", "string", "string", "string", "string", "string"],
            "top5": ["string", "string", "string", "string", "string"]
        }
        `;

        const aiResponse = await askGemini(prompt);
        if (!aiResponse) throw new Error("AI failed to analyze website");

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Invalid AI response format");

        const result = JSON.parse(jsonMatch[0]);

        return NextResponse.json({ success: true, ...result });

    } catch (error: any) {
        console.error("[ANALYSIS ERROR]", error);
        return NextResponse.json({
            error: "Failed to analyze website",
            details: error.message
        }, { status: 500 });
    }
}
