import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { discoverLeads } from "@/lib/reddit-discovery";

/**
 * Trigger discovery scan for a project.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { projectId, debugMode, accountId } = await req.json();

        if (!projectId) {
            return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
        }

        // Verify project ownership
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                userId: (session.user as any).id
            }
        });

        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Verify account ownership (if provided)
        if (accountId) {
            const account = await prisma.redditAccount.findFirst({
                where: { id: accountId, projectId: project.id }
            });
            if (!account) {
                return NextResponse.json({ error: "Account not found or does not belong to this project" }, { status: 404 });
            }
            console.log(`[DISCOVERY] Using account: ${account.username}`);
        }

        const projectName = project.name || projectId;
        console.log(`[DISCOVERY] Starting scan for project: ${projectName} (Debug: ${!!debugMode})`);
        const result = await discoverLeads(projectId, !!debugMode, accountId);

        return NextResponse.json({
            success: true,
            message: `Scan complete. Found ${result.leadsFound} new leads from ${result.totalScanned} posts.`,
            stats: result
        });
    } catch (error: any) {
        console.error("[DISCOVERY API ERROR]", error);
        return NextResponse.json({
            error: "Failed to run discovery scan",
            details: error.message
        }, { status: 500 });
    }
}
