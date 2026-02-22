"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Hero() {
    return (
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/30 mb-8"
                >
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm font-medium text-foreground">Reddit Automation 2.0 is here</span>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                    className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl mx-auto"
                >
                    Scale your SaaS with <br />
                    <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, delay: 0.4, type: "spring" }}
                        className="gradient-text inline-block"
                    >
                        Authentic Reddit Marketing
                    </motion.span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
                >
                    Warm up accounts, build organic karma, and automatically reply to relevant discussions mentioning your keywords. 100% undetectable.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3, type: "spring", stiffness: 200 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    <Link href="/signup" className="w-full sm:w-auto px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-lg hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-2">
                        Start Free Trial <ArrowRight className="w-5 h-5" />
                    </Link>
                    <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-full glass font-bold text-lg hover:bg-white/10 transition-all duration-300 flex items-center justify-center">
                        See How It Works
                    </a>
                </motion.div>

                {/* Dashboard Preview Image/Mockup */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.5 }}
                    className="mt-20 relative mx-auto max-w-5xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
                    <div className="glass-dark rounded-2xl p-2 border-white/10 shadow-2xl overflow-hidden relative">
                        {/* Fake UI mockup */}
                        <div className="h-8 border-b border-white/10 flex items-center px-4 gap-2 bg-black/50">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <div className="bg-[#0A0A0A] p-6 grid grid-cols-4 gap-6 h-[400px]">
                            <div className="col-span-1 border-r border-white/5 space-y-4 pr-4">
                                <div className="h-8 bg-white/5 rounded w-full" />
                                <div className="h-8 bg-primary/20 rounded w-full border border-primary/30" />
                                <div className="h-8 bg-white/5 rounded w-full" />
                            </div>
                            <div className="col-span-3 space-y-6">
                                <div className="flex gap-4">
                                    <div className="h-24 bg-white/5 rounded-xl flex-1 border border-white/5 p-4 flex flex-col justify-end"><div className="h-4 bg-green-500/50 w-1/2 rounded" /></div>
                                    <div className="h-24 bg-white/5 rounded-xl flex-1 border border-white/5 p-4 flex flex-col justify-end"><div className="h-4 bg-blue-500/50 w-3/4 rounded" /></div>
                                    <div className="h-24 bg-white/5 rounded-xl flex-1 border border-white/5 p-4 flex flex-col justify-end"><div className="h-4 bg-purple-500/50 w-1/3 rounded" /></div>
                                </div>
                                <div className="h-48 bg-white/5 rounded-xl border border-white/5 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
