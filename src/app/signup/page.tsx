"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, Mail, Lock, User, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { BlobBackground } from "@/components/ui/BlobBackground";

export default function SignupPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Something went wrong");
            }

            // Auto login after signup
            router.push("/login?signup=success");
        } catch (err: any) {
            console.error(err.message);
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

            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center z-10">

                {/* Left Side Info */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="hidden md:block space-y-8"
                >
                    <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-foreground">
                        Start automating <br />
                        <span className="gradient-text">your growth today.</span>
                    </h1>

                    <div className="space-y-4">
                        {["7-day free trial on all plans", "No credit card required", "Setup in under 5 minutes"].map((text, i) => (
                            <div key={i} className="flex items-center gap-3 text-muted-foreground text-lg">
                                <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                                <span>{text}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Form Side */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                >
                    <div className="glass rounded-3xl p-8 border-border shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500" />

                        <div className="text-center mb-8 md:hidden">
                            <h2 className="text-2xl font-bold text-foreground mb-2">Create Account</h2>
                            <p className="text-muted-foreground text-sm">Start your 7-day free trial</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-muted-foreground ml-1">Full Name</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <User className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-background/50 border border-border rounded-xl py-3 pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>

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
                                <label className="text-sm font-medium text-muted-foreground ml-1">Password</label>
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
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3.5 rounded-xl hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>Create Account <ArrowRight className="w-4 h-4" /></>
                                )}
                            </button>
                        </form>

                        <p className="text-center text-gray-400 mt-8 text-sm">
                            Already have an account? <Link href="/login" className="text-primary font-semibold hover:underline">Log in</Link>
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
