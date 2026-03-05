import { PrismaClient } from "@prisma/client";

declare global {
    var prisma: PrismaClient | undefined;
}

// ✅ Prisma with connection retry for Railway PostgreSQL
function createPrismaClient() {
    return new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });
}

export const prisma = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

/**
 * Wraps a Prisma call with auto-retry on connection failure.
 * Railway PostgreSQL proxy can drop connections — this handles it gracefully.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isConnectionError =
                err?.message?.includes("Can't reach database") ||
                err?.message?.includes("Connection refused") ||
                err?.message?.includes("ECONNREFUSED") ||
                err?.message?.includes("connect ETIMEDOUT") ||
                err?.code === "P1001";

            if (isConnectionError && attempt < retries) {
                console.warn(`[DB] Connection failed (attempt ${attempt}/${retries}). Retrying in ${delayMs}ms...`);
                await new Promise(res => setTimeout(res, delayMs * attempt));
                try {
                    await prisma.$connect();
                } catch { }
                continue;
            }
            throw err;
        }
    }
    throw new Error("Max retries exceeded");
}
