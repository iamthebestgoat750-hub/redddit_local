import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Fetch discovered leads for a project.
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
        return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    try {
        const leads = await prisma.lead.findMany({
            where: {
                projectId: projectId,
                project: { userId: (session.user as any).id }
            },
            orderBy: [
                { relevanceScore: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        return NextResponse.json({ leads });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
    }
}
