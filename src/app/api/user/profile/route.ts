import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: (session.user as any).id },
            select: {
                id: true,
                name: true,
                email: true,
            },
        });

        return NextResponse.json(user);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name, email } = await req.json();

        const updatedUser = await prisma.user.update({
            where: { id: (session.user as any).id },
            data: {
                name,
                email, // Note: You might want additional verification for email changes
            },
            select: {
                id: true,
                name: true,
                email: true,
            }
        });

        return NextResponse.json({
            message: "Profile updated successfully",
            user: updatedUser
        });
    } catch (error: any) {
        console.error("Profile update error:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
