"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BlobBackground } from "@/components/ui/BlobBackground";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                // Handle error (optional: add error state toast/alert)
            } else {
                router.push("/dashboard");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4 bg-background text-foreground">
            <BlobBackground />

            <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
                <Bot className="w-6 h-6 text-primary" />
                <span className="font-bold tracking-tight text-xl">Post Loom</span>
            </Link>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md"
            >
                <div className="glass rounded-3xl p-8 border-border shadow-2xl relative overflow-hidden">
                    {/* Decorative top gradient */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-blue-500" />

                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-foreground mb-2">Welcome Back</h1>
                        <p className="text-muted-foreground">Sign in to your Post Loom dashboard</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-muted-foreground ml-1">Email Address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-background/50 border border-border rounded-xl py-3 pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="name@company.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between ml-1">
                                <label className="text-sm font-medium text-muted-foreground">Password</label>
                                <a href="#" className="text-xs text-primary hover:text-primary/80">Forgot?</a>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-background/50 border border-border rounded-xl py-3 pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>Sign In <ArrowRight className="w-4 h-4" /></>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-gray-400 mt-8 text-sm">
                        Don't have an account? <Link href="/signup" className="text-primary font-semibold hover:underline">Sign up</Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
