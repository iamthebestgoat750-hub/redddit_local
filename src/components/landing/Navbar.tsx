"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Menu, X, Bot, ArrowRight } from "lucide-react";

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    const navLinks = [
        { name: "Features", href: "#features" },
        { name: "How it Works", href: "#how-it-works" },
        { name: "Pricing", href: "#pricing" },
        { name: "FAQ", href: "#faq" },
    ];

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="fixed top-0 left-0 right-0 z-50 px-6 py-8 pointer-events-none"
        >
            <div className="max-w-7xl mx-auto flex items-center justify-between glass px-8 py-4 rounded-[2rem] shadow-xl pointer-events-auto">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-all">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">PostLoom</span>
                </Link>

                {/* Desktop Nav (Centered) */}
                <div className="hidden lg:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-6 glass px-6 py-2 rounded-full border border-black/5 dark:border-white/5">
                        {navLinks.map((link) => (
                            <Link
                                key={link.name}
                                href={link.href}
                                className="text-[11px] uppercase font-black tracking-[0.2em] text-muted-foreground hover:text-primary transition-all"
                            >
                                {link.name}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Auth - Right */}
                <div className="flex items-center gap-6">
                    <Link href="/login" className="hidden sm:block text-[11px] uppercase font-black tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors">
                        Login
                    </Link>
                    <Link
                        href="/signup"
                        className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-primary-foreground bg-primary border border-primary/20 rounded-full overflow-hidden transition-all hover:bg-primary/90 hover:scale-105 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </Link>

                    <button
                        className="lg:hidden text-foreground p-2 glass rounded-xl"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="lg:hidden mt-4 mx-auto max-w-sm glass p-8 rounded-[2rem] border shadow-2xl pointer-events-auto"
                    >
                        <div className="flex flex-col gap-6">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className="text-lg font-black text-foreground tracking-tight"
                                    onClick={() => setIsOpen(false)}
                                >
                                    {link.name}
                                </Link>
                            ))}
                            <div className="h-[1px] bg-border my-2" />
                            <Link href="/login" className="text-lg font-black text-foreground" onClick={() => setIsOpen(false)}>Login</Link>
                            <Link
                                href="/signup"
                                className="btn-primary text-center py-5 text-lg"
                                onClick={() => setIsOpen(false)}
                            >
                                Start Free Trial
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    );
}
