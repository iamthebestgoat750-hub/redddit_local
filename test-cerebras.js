
const apiKey = "csk-fthmtp5jrkfkjhfmvdtyjvkwx5jc95vnn8d5eenk42kkyxcw";
async function test() {
    console.log("Testing Cerebras API via Fetch...");
    try {
        const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "llama3.1-8b",
                messages: [{ role: "user", content: "Say hello" }],
            }),
        });
        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
