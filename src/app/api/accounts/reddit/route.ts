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

    let accountId: string | null = null;

    try {
        const { username, password, debugMode } = await req.json();

        if (!username || !password) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const cleanInput = username.trim().replace(/^u\//i, "");

        if (cleanInput.length < 3) {
            return NextResponse.json({ error: "Invalid Reddit username/email length." }, { status: 400 });
        }

        // Find or create a project
        let project = await prisma.project.findFirst({
            where: { userId: (session.user as any).id },
        });

        if (!project) {
            project = await prisma.project.create({
                data: {
                    name: "Default Project",
                    userId: (session.user as any).id,
                },
            });
        }

        // Check for duplicate BEFORE creating
        const existingAcc = await prisma.redditAccount.findFirst({
            where: {
                username: cleanInput,
                project: { userId: (session.user as any).id }
            }
        });

        if (existingAcc) {
            return NextResponse.json({ error: `Account @${cleanInput} is already connected.` }, { status: 400 });
        }

        const encryptedPassword = encrypt(password);

        // ✅ Create account FIRST with 'connecting' status so screenshots can be saved to DB
        const tempAccount = await prisma.redditAccount.create({
            data: {
                username: cleanInput,
                password: encryptedPassword,
                projectId: project.id,
                status: "connecting",
                karma: 0,
                accountAge: 0,
            },
        });

        accountId = tempAccount.id;

        // On Railway/production: ALWAYS headless (no XServer). Only locally can we open a visible browser.
        const isProduction = process.env.NODE_ENV === 'production';
        const headless = isProduction ? true : !debugMode;
        const verification = await verifyRedditCredentials(cleanInput, password, headless, accountId);

        if (!verification.success) {
            console.warn(`Verification failed for ${cleanInput}: ${verification.error}`);
            // Keep account with 'failed' status so user can review screenshots
            await prisma.redditAccount.update({
                where: { id: accountId },
                data: { status: "failed" }
            });
            return NextResponse.json({
                error: verification.error || "Login failed. Please check your credentials."
            }, { status: 400 });
        }

        const verifiedUsername = verification.username || cleanInput;
        console.log(`Verification successful. Real Username: ${verifiedUsername}`);

        // Check for duplicate with REAL username (handles email login)
        const existingVerified = await prisma.redditAccount.findFirst({
            where: {
                username: verifiedUsername,
                project: { userId: (session.user as any).id },
                NOT: { id: accountId }
            }
        });

        if (existingVerified) {
            await prisma.redditAccount.delete({ where: { id: accountId } });
            return NextResponse.json({ error: `Account @${verifiedUsername} is already connected.` }, { status: 400 });
        }

        const browserCookiesJson = verification.cookies && verification.cookies.length > 0
            ? JSON.stringify(verification.cookies)
            : null;

        // Update account with real verified data
        const account = await (prisma as any).redditAccount.update({
            where: { id: accountId },
            data: {
                username: verifiedUsername,
                status: "active",
                karma: verification.karma || 0,
                accountAge: verification.accountAge || 0,
                browserCookies: browserCookiesJson,
            },
        });

        return NextResponse.json({
            message: "Account connected successfully",
            account: {
                id: account.id,
                username: account.username,
            },
        });

    } catch (error: any) {
        console.error("Reddit connection error:", error);
        // Clean up temp account if something crashed
        if (accountId) {
            await prisma.redditAccount.delete({ where: { id: accountId } }).catch(() => { });
        }
        return NextResponse.json({ error: "Failed to connect account" }, { status: 500 });
    }
}
