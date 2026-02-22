import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { NextResponse } from "next/server";
import { verifyRedditCredentials } from "@/lib/reddit-verify";


export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const accounts = await prisma.redditAccount.findMany({
            where: {
                project: {
                    userId: (session.user as any).id,
                },
            },
            select: {
                id: true,
                username: true,
                status: true,
                karma: true,
                accountAge: true,
                createdAt: true,
            },
        });

        return NextResponse.json(accounts);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { username, password, debugMode } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        // Clean username: remove u/, trim (but allow @ for login)
        const cleanInput = username.trim().replace(/^u\//i, "");

        if (cleanInput.length < 3) {
            return NextResponse.json({ error: "Invalid Reddit username/email length." }, { status: 400 });
        }

        // --- REAL VERIFICATION (Playwright) ---
        console.log(`Verifying credentials for ${cleanInput}...`);
        const headless = !debugMode;
        const verification = await verifyRedditCredentials(cleanInput, password, headless);

        if (!verification.success) {
            console.warn(`Verification failed for ${cleanInput}: ${verification.error}`);
            return NextResponse.json({
                error: verification.error || "Login failed. Please check your credentials."
            }, { status: 400 });
        }

        const verifiedUsername = verification.username || cleanInput;
        console.log(`Verification successful. Real Username: ${verifiedUsername}`);

        // Check for duplicates with the REAL username
        const existingAcc = await prisma.redditAccount.findFirst({
            where: {
                username: verifiedUsername,
                project: { userId: (session.user as any).id }
            }
        });

        if (existingAcc) {
            return NextResponse.json({ error: `Account @${verifiedUsername} is already connected.` }, { status: 400 });
        }

        // Find first project (default)
        let project = await prisma.project.findFirst({
            where: { userId: (session.user as any).id },
        });

        // Create default project if none exists (fallback)
        if (!project) {
            project = await prisma.project.create({
                data: {
                    name: "Default Project",
                    userId: (session.user as any).id,
                },
            });
        }

        const encryptedPassword = encrypt(password);

        const account = await prisma.redditAccount.create({
            data: {
                username: verifiedUsername, // Store the REAL username
                password: encryptedPassword,
                projectId: project.id,
                status: "active",
                karma: verification.karma || 0,
                accountAge: verification.accountAge || 0,
            },
        });

        return NextResponse.json({
            message: "Account connected successfully",
            account: {
                id: account.id,
                username: account.username,
            },
        });
    } catch (error) {
        console.error("Reddit connection error:", error);
        return NextResponse.json({ error: "Failed to connect account" }, { status: 500 });
    }
}
