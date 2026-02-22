import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name, description, websiteUrl, websiteDescription, replyTone, mentionType, targetSubreddits } = await req.json();

        // Use Raw SQL because prisma generate is blocked by file locks
        // This ensures new fields are saved even if the Prisma client is outdated
        const subsJson = typeof targetSubreddits === 'string' ? targetSubreddits : JSON.stringify(targetSubreddits);

        await prisma.$executeRaw`
            UPDATE Project 
            SET name = COALESCE(${name}, name), 
                description = COALESCE(${description}, description), 
                websiteUrl = COALESCE(${websiteUrl}, websiteUrl), 
                websiteDescription = COALESCE(${websiteDescription}, websiteDescription), 
                replyTone = COALESCE(${replyTone}, replyTone), 
                mentionType = COALESCE(${mentionType}, mentionType),
                targetSubreddits = COALESCE(${subsJson}, targetSubreddits),
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ${params.id} AND userId = ${(session.user as any).id}
        `;

        const updatedResults: any[] = await prisma.$queryRaw`
            SELECT * FROM Project WHERE id = ${params.id} LIMIT 1
        `;
        const updated = updatedResults[0];

        return NextResponse.json({ success: true, project: updated });
    } catch (error: any) {
        console.error("[PROJECT UPDATE ERROR]", error);
        return NextResponse.json({ error: error.message || "Failed to update project" }, { status: 500 });
    }
}
