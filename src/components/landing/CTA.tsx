"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function CTA() {
    return (
        <section className="py-24 relative overflow-hidden">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="glass-dark rounded-3xl p-10 md:p-16 text-center border-primary/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 animate-pulse" />

                    <h2 className="text-3xl md:text-5xl font-bold mb-6 text-foreground relative z-10">Ready to put your Reddit growth <br /> on autopilot?</h2>
                    <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto relative z-10">
                        Join 2,000+ founders who are generating leads and sales from Reddit without spending hours every day.
                    </p>

                    <Link href="/signup" className="relative z-10 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-bold text-lg hover:scale-105 transition-transform duration-300">
                        Start Your 7-Day Free Trial
                    </Link>
                </div>
            </div>
        </section>
    );
}
