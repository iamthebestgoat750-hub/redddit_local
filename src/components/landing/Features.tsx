"use client";

import { motion } from "framer-motion";
import { Shield, TrendingUp, MessageSquare } from "lucide-react";

export default function Features() {
    const features = [
        {
            icon: Shield,
            title: "Anti-Ban Protection",
            desc: "Residential proxies, human-like typing delays, and browser fingerprint spoofing keep your accounts perfectly safe."
        },
        {
            icon: TrendingUp,
            title: "Smart Karma Farming",
            desc: "Automatically engages with high-probability posts in specific subreddits to build authentic post and comment karma."
        },
        {
            icon: MessageSquare,
            title: "Keyword Auto-Reply",
            desc: "Monitor Reddit for keywords related to your SaaS and automatically drop helpful replies plugging your product."
        }
    ];

    return (
        <section id="features" className="py-24 relative">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Everything you need to <span className="gradient-text">dominate Reddit</span></h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Stop wasting hours manually managing accounts. Let our AI handle the grunt work while you focus on building your product.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((f, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="glass p-8 rounded-3xl soft-lift relative group overflow-hidden"
                            whileHover={{ y: -8, transition: { duration: 0.3 } }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <motion.div
                                whileHover={{ rotate: 360, scale: 1.1 }}
                                transition={{ duration: 0.5 }}
                                className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 relative z-10 border border-primary/20 group-hover:border-primary/50 transition-colors"
                            >
                                <f.icon className="w-7 h-7 text-primary" />
                            </motion.div>
                            <h3 className="text-xl font-bold mb-3 text-foreground relative z-10">{f.title}</h3>
                            <p className="text-muted-foreground relative z-10">{f.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
