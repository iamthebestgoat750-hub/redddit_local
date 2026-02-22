import { redis } from '../lib/redis';

async function testInfra() {
    console.log('--- Testing Redis Mock Fallback ---');

    // @ts-ignore - access private for testing
    console.log('Is Mock Mode active?', redis.isMock);

    const key = 'test_key';
    const val = 'test_val_' + Date.now();

    console.log('Checking duplication (should be false)...');
    const dup1 = await redis.isDuplicate(key, val);
    console.log('Result:', dup1);

    console.log('Marking as processed...');
    await redis.markProcessed(key, val);

    console.log('Checking duplication again (should be true even with connection failure)...');
    const dup2 = await redis.isDuplicate(key, val);
    console.log('Result:', dup2);

    if (dup2 === true) {
        console.log('SUCCESS: In-memory fallback is working!');
    } else {
        console.error('FAILED: In-memory fallback failed.');
    }
}

testInfra().catch(console.error);
