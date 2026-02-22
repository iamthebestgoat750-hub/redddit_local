import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function DELETE(
    req: Request,
    { params }: { params: any }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await (params as any);

    try {
        console.log(`Attempting to delete account ${id} for user ${(session.user as any).id}`);

        const result = await prisma.redditAccount.deleteMany({
            where: {
                id: id,
                project: { userId: (session.user as any).id }
            },
        });

        console.log(`Delete result:`, result);

        if (result.count === 0) {
            console.error(`Deletion failed: No account found with ID ${id} for this user.`);
            return NextResponse.json({ error: "Account not found or unauthorized" }, { status: 404 });
        }

        return NextResponse.json({ message: "Account deleted successfully" });
    } catch (error: any) {
        console.error("Delete error details:", error);
        return NextResponse.json({
            error: "Failed to delete account",
            details: error.message
        }, { status: 500 });
    }
}
