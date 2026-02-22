"use client";

import { motion } from "framer-motion";
import { Rocket, Bot, Building2 } from "lucide-react";

const cases = [
    {
        icon: Rocket,
        title: "SaaS Startup Launch",
        product: "Project Management Tool",
        strategy: "100+ qualified signups in 48 hours by naturally introducing our tool across developer subreddits.",
        result: "100+ Signups",
        color: "primary"
    },
    {
        icon: Bot,
        title: "AI Tool Promotion",
        product: "Writing Assistant",
        strategy: "Secured consistent traffic by solving writer roadblocks in r/productivity without ever feeling like an ad.",
        result: "24/7 Traffic",
        color: "primary"
    },
    {
        icon: Building2,
        title: "Marketing Agency",
        product: "Multi-Client Management",
        strategy: "Managed 20+ clients on autopilot with zero bans and 300% efficiency increase in lead capture.",
        result: "300% Growth",
        color: "primary"
    }
];

export default function UseCases() {
    return (
        <section id="use-cases" className="relative py-24 bg-background overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className="text-center mb-32">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-[11px] uppercase font-black tracking-[0.3em] text-primary mb-6"
                    >
                        Proven Results
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-5xl md:text-7xl font-black text-foreground mb-10 tracking-tighter"
                    >
                        Built for <span className="gradient-text italic">Success</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium"
                    >
                        See how founders are turning Reddit into their #1 source of growth.
                    </motion.p>
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                    {cases.map((c, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="group glass p-10 rounded-[2.5rem] border border-white/5 hover:border-primary/30 soft-lift transition-all duration-500 flex flex-col items-start relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className={`w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-10 group-hover:scale-110 transition-transform relative z-10 border border-primary/20`}>
                                <c.icon className="w-7 h-7" />
                            </div>
                            <h3 className="text-3xl font-black text-foreground mb-4 tracking-tight relative z-10">
                                {c.title}
                            </h3>
                            <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-8 relative z-10">
                                {c.product}
                            </p>

                            <p className="text-muted-foreground font-medium leading-relaxed mb-12 relative z-10">
                                "{c.strategy}"
                            </p>

                            <div className="mt-auto w-full pt-8 border-t border-white/5 flex items-center justify-between relative z-10">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">The Result</span>
                                <span className="text-lg font-black text-primary tracking-tight">{c.result}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
