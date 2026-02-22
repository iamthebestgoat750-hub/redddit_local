"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
    {
        question: "Is it safe for my Reddit accounts?",
        answer: "Absolutely. Post Loom uses residential proxies, human-like typing patterns, and browser fingerprint spoofing to ensure your accounts mimic real human behavior exactly. We've managed thousands of accounts without bans."
    },
    {
        question: "How does the AI warming work?",
        answer: "Our AI analyzes subreddits relevant to your niche and engages with popular posts through upvotes and helpful comments. This builds 'post' and 'comment' karma naturally, increasing your account's authority."
    },
    {
        question: "Can I monitor multiple keywords?",
        answer: "Yes! Depending on your plan, you can monitor dozens or even unlimited keywords. Our system scans Reddit in real-time and alerts you (or auto-replies) whenever they are mentioned."
    },
    {
        question: "Do I need to provide my own proxies?",
        answer: "No, we handle everything. Our Growth and Agency plans include high-quality residential proxies specifically optimized for Reddit to ensure maximum security and performance."
    },
    {
        question: "Can I cancel my subscription any time?",
        answer: "Yes, you can cancel at any time from your dashboard. There are no long-term contracts or hidden fees. You'll keep access to your features until the end of your current billing period."
    }
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <section id="faq" className="py-24 relative bg-background">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Frequently Asked <span className="gradient-text">Questions</span></h2>
                    <p className="text-muted-foreground text-lg font-medium">Everything you need to know about automation and safety.</p>
                </div>

                <div className="space-y-4">
                    {faqs.map((faq, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.05 }}
                            className="glass rounded-[1.5rem] border-white/20 overflow-hidden shadow-sm"
                        >
                            <button
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                                className="w-full px-8 py-6 text-left flex items-center justify-between hover:bg-white/50 transition-colors"
                            >
                                <span className="text-lg font-bold text-foreground">{faq.question}</span>
                                <ChevronDown
                                    className={`w-5 h-5 text-primary transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`}
                                />
                            </button>

                            <div
                                className={`overflow-hidden transition-all duration-300 ease-in-out ${openIndex === i ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                                    }`}
                            >
                                <div className="px-8 pb-6 text-muted-foreground font-medium leading-relaxed">
                                    {faq.answer}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
