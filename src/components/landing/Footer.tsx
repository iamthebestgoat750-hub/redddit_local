"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Github, Twitter, Linkedin, Mail, Zap } from "lucide-react";

export default function Footer() {
    return (
        <footer className="bg-white border-t border-gray-100 pt-32 pb-12 overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-12 mb-20">
                    <div className="col-span-2">
                        <Link href="/" className="flex items-center gap-3 mb-8 group">
                            <div className="relative w-8 h-8 flex items-center justify-center">
                                <div className="absolute inset-0 bg-indigo-600 rounded-lg rotate-6 group-hover:rotate-12 transition-transform duration-500" />
                                <div className="relative z-10 text-white">
                                    <Zap size={18} />
                                </div>
                            </div>
                            <span className="text-xl font-black tracking-tighter text-gray-900 uppercase">
                                Post<span className="text-indigo-600">Loom</span>
                            </span>
                        </Link>
                        <p className="text-gray-500 font-bold mb-10 max-w-xs leading-relaxed">
                            The world's most intelligent AI-powered Reddit growth platform for serious founders.
                        </p>
                        <div className="flex gap-4">
                            {[Twitter, Github, Linkedin].map((Icon, i) => (
                                <Link
                                    key={i}
                                    href="#"
                                    className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-gray-100"
                                >
                                    <Icon className="w-5 h-5" />
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-900 mb-6">Product</h4>
                        <ul className="space-y-4">
                            {["Features", "Pricing", "Security", "AI Agent"].map((item) => (
                                <li key={item}><Link href="#" className="text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">{item}</Link></li>
                            ))}
                        </ul>
                    </div>

                    <div className="lg:col-span-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-900 mb-6">Company</h4>
                        <ul className="space-y-4">
                            {["About", "Blog", "Careers", "Customers"].map((item) => (
                                <li key={item}><Link href="#" className="text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">{item}</Link></li>
                            ))}
                        </ul>
                    </div>

                    <div className="lg:col-span-4">
                        <div className="bg-indigo-50/50 p-8 rounded-[2rem] border border-indigo-100">
                            <h4 className="text-sm font-black text-gray-900 mb-3 tracking-tight">Subscribe to our newsletter</h4>
                            <p className="text-xs font-semibold text-gray-500 mb-6 leading-relaxed">Get the latest Reddit growth hacks and AI marketing strategies.</p>
                            <div className="flex items-center gap-2 p-1.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                                <input
                                    type="email"
                                    placeholder="Enter your email"
                                    className="bg-transparent text-sm font-bold text-gray-900 px-3 flex-1 outline-none placeholder:text-gray-400"
                                />
                                <button className="btn-nav-primary truncate px-6 py-2.5 rounded-lg text-[10px]">
                                    Join
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-100 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                        © 2024 PostLoom Inc. All rights reserved.
                    </p>
                    <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <Link href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</Link>
                        <Link href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
