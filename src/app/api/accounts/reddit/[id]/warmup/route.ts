import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { warmupAccount } from "@/lib/reddit-warmup";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const debugMode = body.debugMode || false;

    try {
        const result = await warmupAccount(id, !debugMode);

        if (result.success) {
            return NextResponse.json({
                message: "Warmup session completed successfully!",
                logs: result.logs
            });
        } else {
            return NextResponse.json({
                error: result.error || "Warmup session failed",
                logs: result.logs
            }, { status: 500 });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        await prisma.redditAccount.update({
            where: { id: id },
            data: { status: "active" }
        });

        return NextResponse.json({ message: "Stop signal sent successfully" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
