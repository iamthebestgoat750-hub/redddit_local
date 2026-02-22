"use client";

import { motion } from "framer-motion";
import { UserPlus, Zap, MessageSquare, TrendingUp } from "lucide-react";

export default function HowItWorks() {
    const steps = [
        {
            icon: UserPlus,
            title: "Add Accounts",
            desc: "Securely connect multiple accounts using our built-in residential proxies."
        },
        {
            icon: Zap,
            title: "AI Warming",
            desc: "Build trust and karma naturally with AI-driven engagement and activity."
        },
        {
            icon: MessageSquare,
            title: "Track Keywords",
            desc: "Get instant alerts whenever your niche or competitors are mentioned."
        },
        {
            icon: TrendingUp,
            title: "Auto-Reply",
            desc: "AI detects relevant posts and replies with helpful mentions of your product."
        }
    ];

    return (
        <section id="how-it-works" className="py-24 relative bg-background overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center mb-20">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">How <span className="gradient-text">Post Loom works</span></h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto font-medium">Four simple steps to automate your Reddit presence and grow your SaaS.</p>
                </div>

                <div className="relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent -translate-y-1/2" />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {steps.map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="relative z-10"
                            >
                                <div className="bg-white border border-white/50 shadow-xl rounded-[2.5rem] p-8 pt-20 text-center h-full soft-lift relative overflow-visible">
                                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mt-8 mb-6 border border-primary/20 shadow-sm shadow-primary/10 relative z-20">
                                        <step.icon className="w-8 h-8 text-primary" />
                                    </div>
                                    <div className="absolute top-4 left-6 text-6xl font-black text-slate-900/10 select-none pointer-events-none z-10">
                                        0{i + 1}
                                    </div>
                                    <h3 className="text-xl font-bold mb-3 text-foreground">{step.title}</h3>
                                    <p className="text-muted-foreground font-medium leading-relaxed">{step.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
