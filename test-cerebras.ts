
import { askCerebras } from "./src/lib/cerebras";
import * as dotenv from "dotenv";
dotenv.config();

async function test() {
    console.log("Testing Cerebras API...");
    const result = await askCerebras("Say 'Cerebras is working!' if you can read this.");
    if (result) {
        console.log("✅ SUCCESS:", result);
    } else {
        console.error("❌ FAILED: Cerebras did not return a response. Check terminal logs above.");
    }
}

test();
