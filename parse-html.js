const fs = require('fs');

const content = fs.readFileSync('reddit_login_source.html', 'utf8');

console.log('--- Searching for keywords ---');
const keywords = ['username', 'email', 'password', 'login', 'Log In', 'user-name', 'pass-word'];
keywords.forEach(k => {
    const index = content.indexOf(k);
    if (index !== -1) {
        console.log(`Keyword "${k}" found at index ${index}`);
        console.log(`Snippet: ${content.substring(index - 50, index + 50)}`);
    } else {
        console.log(`Keyword "${k}" not found`);
    }
});

console.log('--- Checking for input tags ---');
const inputMatch = content.match(/<input[^>]*>/g);
if (inputMatch) {
    console.log(`Found ${inputMatch.length} input tags:`);
    inputMatch.forEach((m, idx) => console.log(`${idx}: ${m}`));
} else {
    console.log('No <input> tags found');
}

console.log('--- Checking for button tags ---');
const buttonMatch = content.match(/<button[^>]*>.*?<\/button>/g);
if (buttonMatch) {
    console.log(`Found ${buttonMatch.length} button tags`);
    buttonMatch.forEach((m, idx) => {
        if (m.includes('Log In') || m.includes('submit')) {
            console.log(`${idx}: ${m}`);
        }
    });
}
