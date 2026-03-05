/**
 * Manually saves subreddit rules to DB — no browser, no account needed.
 * Run: npx tsx scripts/save-rules-manual.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { prisma } from "../src/lib/db";

const RULES: Record<string, string> = {
    NoStupidQuestions: `1. All direct answers to a post must make a genuine attempt to answer the question. Joke responses at the parent-level will be removed. Accounts using AI to generate answers will be banned. Follow-up questions at the top level are allowed.
2. Do not answer by only dropping a link and do not tell users they should "google it." Include a summary of the link or answer the question yourself.
3. Please try searching the subreddit for your question first. Try to keep repeat posts to a minimum.
4. Be Nice: Follow Reddiquette. Be polite and respectful in your exchanges. Civil disagreements can happen, but insults should not. Personal attacks, slurs, bigotry, etc. are not permitted at any time.
5. No medical advice questions. A rule of thumb: Could this question or its answers make someone decide not to go see a doctor when they really should?
6. No trolling or joke questions. Disallowed: questions that are joke or trolling questions, memes, just song lyrics as title, etc.
7. No suicide or 'was I raped/sexually assaulted/sexually harassed?' questions. These are best handled by trained, professional support resources.
8. No self-promotion, shilling or begging. No trying to draw traffic to product/video/podcast/website by phrasing it in the form of a question. Asking for upvotes, birthday wishes, handouts, or fundraising support falls under this.
9. No illegal/unethical or disturbing subject matter. Tasteless or disturbing questions regarding loli, pedophilia, murder, violence or other sketchy subject matter are not welcome.
10. No disguised rants, agenda posts or potstirring. Questions not asked in good faith will be removed.`,

    NewToReddit: `1. Be kind, decent, polite, & respectful. SFW content only. Tag post NSFW if profile is 18+. This community is a safe space for everyone. Engage in good faith; no trolling.
2. Post to ask questions about using Reddit. All posts must be questions about using Reddit. This is not the correct place for venting, rants, complaints, inflammatory or loaded questions, debate, user polls, speculation, or suggestions for Reddit.
3. Please avoid asking questions from our common questions list. Do not ask about topics listed in the FAQ. Only post if the answer to your question is not there.
4. Post only once per 72 hours. This gives everyone a fair chance to ask their question. If you already have a post and have further questions, please add them as replies.
5. All comments should be constructive. All replies to a post should be a genuine attempt to help the poster. All comments should be constructive, instructive, or an enquiry.
6. Refrain from asking for votes or karma, naming free karma subs, or sharing how you are voting. We discourage use of subs offering free karma.
7. Refrain from sharing or requesting specific community requirements. Avoid asking for or sharing specific community requirements.
8. Be as accurate and understanding as you can. Please strive to ensure the information you are providing is correct and tailored for new or inexperienced redditors.
9. Be considerate in negative situations. If your content is about a negative interaction, only explain the situation objectively. Do not mention names of communities, users, or mods.
10. Promotions should be shared elsewhere. No unapproved adverts or promotion at all.
11. Please avoid using Large Language Models (LLMs) here. Answers produced this way are not accurate. We value answers from your own experience, in your own words, tailored for OP.`,

    AmazingStories: `1. Be Nice: Kindness first. No hate, harassment, discrimination or personal attacks.
2. Original or credited content only. Share your own stories or properly credit the author.
3. No NSFW posts. Romance is part of great stories, just fade to black when things get steamy. Avoid overly graphic details.
4. Follow Reddiquette. All members must follow Reddiquette and general Reddit policies.
5. Posting in Other Languages? All posts must be in English language. If posting in another language, please include an English translation.`,

    // Advice uses short community-specific guidelines
    Advice: `1. Be kind and respectful. No hate speech, harassment, or personal attacks allowed.
2. Give genuine advice. Responses must make a genuine attempt to help. Joke responses are not allowed.
3. No self-promotion or advertising. Do not use this community to promote products, services, or your own content.
4. Follow Reddit's site-wide rules. All Reddit content policy rules apply here.`,
};

async function main() {
    const now = new Date();
    for (const [name, rules] of Object.entries(RULES)) {
        await prisma.subreddit.upsert({
            where: { name },
            update: { rules, lastScraped: now },
            create: { name, rules, lastScraped: now },
        });
        console.log(`✅ Saved rules for r/${name} (${rules.split('\n').length} rules)`);
    }
    console.log("\n🎉 All rules saved to DB successfully!");
    await prisma.$disconnect();
}

main().catch(console.error);
