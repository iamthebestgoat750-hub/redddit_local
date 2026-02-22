import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisWrapper {
    private client: Redis | null = null;
    private isMock = false;
    private mockSet = new Set<string>();

    constructor() {
        if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
            console.warn('[REDIS] No REDIS_URL found in production. De-duplication might fail.');
        }

        try {
            this.client = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: () => null // Don't hang the app if redis is down
            });

            this.client.on('error', (err) => {
                console.warn('[REDIS] Connection failed, switching to mock mode (In-Memory).', err.message);
                this.isMock = true;
            });
        } catch (e) {
            this.isMock = true;
        }
    }

    async isDuplicate(key: string, value: string): Promise<boolean> {
        if (this.isMock) return this.mockSet.has(`${key}:${value}`);
        if (!this.client) return false;
        try {
            const exists = await this.client.sismember(key, value);
            return exists === 1;
        } catch {
            return false;
        }
    }

    async markProcessed(key: string, value: string, expirySeconds: number = 86400 * 7) {
        if (this.isMock) {
            this.mockSet.add(`${key}:${value}`);
            // Simple cleanup for mock mode after 1 hour (optional, but good for long runs)
            setTimeout(() => this.mockSet.delete(`${key}:${value}`), 3600000);
            return;
        }
        if (!this.client) return;
        try {
            await this.client.sadd(key, value);
            await this.client.expire(key, expirySeconds);
        } catch (e) {
            console.error('[REDIS] markProcessed failed:', e);
        }
    }
}

export const redis = new RedisWrapper();
