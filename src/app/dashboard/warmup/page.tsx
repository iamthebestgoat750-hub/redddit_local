"use client";

import { useState, useEffect } from "react";
import { Flame, Play, Square, Loader2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface RedditAccount {
    id: string;
    username: string;
    status: string;
    karma: number;
    accountAge: number;
}

interface WarmupStatus {
    [key: string]: {
        isActive: boolean;
        currentAction: string;
        logs: string[];
    };
}

export default function WarmupPage() {
    const [accounts, setAccounts] = useState<RedditAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [warmupStates, setWarmupStates] = useState<WarmupStatus>({});
    const [debugMode, setDebugMode] = useState(false);

    const fetchAccounts = async (showLoading = false) => {
        if (showLoading) setIsLoading(true);
        try {
            const res = await fetch("/api/accounts/reddit");
            if (!res.ok) throw new Error("Failed to fetch accounts");
            const data = await res.json();
            setAccounts(data);

            setWarmupStates(prev => {
                const next = { ...prev };
                data.forEach((acc: RedditAccount) => {
                    const isServerWarming = acc.status === 'warming' || acc.status === 'warmup';

                    // If server says warming but we thought we were idle, sync up
                    if (isServerWarming && !next[acc.id]?.isActive) {
                        next[acc.id] = {
                            isActive: true,
                            currentAction: "Warming...",
                            logs: ["Detected active session..."]
                        };
                    }
                    // If server says idle/active but we thought we were warming, sync down
                    else if (!isServerWarming && next[acc.id]?.isActive) {
                        // Important: Don't flip to false immediately if we just clicked Play 
                        // and the server hasn't updated the DB to 'warmup' yet.
                        // But if it's been more than a few seconds, it should be in sync.
                        next[acc.id] = {
                            ...next[acc.id],
                            isActive: false,
                            currentAction: "Ready"
                        };
                    }
                    // Baseline state for idle accounts
                    if (!next[acc.id]) {
                        next[acc.id] = { isActive: false, currentAction: "Idle", logs: [] };
                    }
                });
                return next;
            });
        } catch (error) {
            toast.error("Error loading accounts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts(true);
        // Polling loop to keep UI in sync with backend
        const interval = setInterval(() => fetchAccounts(false), 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleWarmup = async (id: string, username: string) => {
        const currentlyActive = warmupStates[id]?.isActive;

        if (!currentlyActive) {
            setWarmupStates(prev => ({
                ...prev,
                [id]: { ...prev[id], isActive: true, currentAction: "Starting Engine...", logs: [`Session started for @${username}`] }
            }));

            toast.info(`Starting warmup for @${username}`);

            try {
                const res = await fetch(`/api/accounts/reddit/${id}/warmup`, {
                    method: "POST",
                    body: JSON.stringify({ debugMode }),
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || "Warmup failed");

                toast.success(`Warmup session completed for @${username}`);
                setWarmupStates(prev => ({
                    ...prev,
                    [id]: { ...prev[id], isActive: false, currentAction: "Completed", logs: [...(prev[id]?.logs || []), "Session finished"] }
                }));
                fetchAccounts();
            } catch (error: any) {
                if (error.message === "STOP_SIGNAL" || (error.message && error.message.includes("Stopped"))) {
                    toast.success("Warmup stopped.");
                } else {
                    toast.error(`${username}: ${error.message}`);
                }
                setWarmupStates(prev => ({
                    ...prev,
                    [id]: { ...prev[id], isActive: false, currentAction: "Stopped", logs: [...(prev[id]?.logs || []), `Session stopped.`] }
                }));
                fetchAccounts();
            }
        } else {
            toast.loading("Stopping warmup... Signal sent.", { id: `stop-${id}` });
            try {
                await fetch(`/api/accounts/reddit/${id}/warmup`, { method: "PATCH" });
                // Immediate local update to make the button turn back to Play
                setWarmupStates(prev => ({
                    ...prev,
                    [id]: { ...prev[id], isActive: false, currentAction: "Stopping...", logs: [...(prev[id]?.logs || []), "Stop signal sent"] }
                }));
                // Also fetch all accounts to sync with DB
                setTimeout(() => fetchAccounts(), 1000);
                toast.success("Stop signal sent.", { id: `stop-${id}` });
            } catch (err) {
                toast.error("Failed to send stop signal", { id: `stop-${id}` });
            }
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl">
            <header className="mb-10">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-foreground mb-2 tracking-tight">Warmup <span className="text-primary font-medium">Dashboard</span></h1>
                        <p className="text-muted-foreground font-medium">Automated reputation building for Reddit accounts.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-secondary/30 border border-border/50 px-4 py-2.5 rounded-2xl">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Debug Settings</span>
                            <span className="text-xs font-bold text-foreground">Visible Browser</span>
                        </div>
                        <button
                            onClick={() => setDebugMode(!debugMode)}
                            className={`w-12 h-6 rounded-full transition-all duration-300 relative ${debugMode ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${debugMode ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </div>
            </header>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary/20" />
                </div>
            ) : accounts.length === 0 ? (
                <div className="glass-panel p-16 text-center rounded-3xl border border-border">
                    <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-bold mb-1">No Accounts Detected</h3>
                    <p className="text-muted-foreground text-sm font-medium">Please connect accounts to start the process.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {accounts.map((acc) => {
                        const state = warmupStates[acc.id];
                        const isActive = state?.isActive;

                        return (
                            <motion.div
                                key={acc.id}
                                layout
                                className={`glass-panel p-6 rounded-[2rem] border transition-all duration-300 relative ${isActive ? "border-primary/40 bg-primary/[0.02]" : "border-border/60"
                                    }`}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                    {/* Left: Account Info */}
                                    <div className="flex items-center gap-5 min-w-[240px]">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl border transition-all duration-500 ${isActive ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-secondary text-muted-foreground border-border"
                                            }`}>
                                            {acc.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col">
                                                    <h3 className="text-xl font-bold text-foreground tracking-tight">@{acc.username}</h3>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        toggleWarmup(acc.id, acc.username);
                                                    }}
                                                    className={`p-1.5 rounded-xl transition-all ${isActive
                                                        ? "text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10"
                                                        : "text-primary bg-primary/10 hover:bg-primary/20 border border-primary/10"
                                                        }`}
                                                >
                                                    {isActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{acc.karma} Karma</span>
                                                <span className="w-1 h-1 rounded-full bg-border" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{acc.accountAge}D Old</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle: Current Status */}
                                    <div className="flex-1 bg-secondary/30 p-5 rounded-[1.5rem] border border-border/50 min-h-[90px] flex flex-col justify-center">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">Current Activity</span>
                                            {isActive && (
                                                <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                    <span className="text-[8px] font-bold text-primary uppercase tracking-widest">Active</span>
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-[15px] font-bold tracking-tight ${isActive ? "text-primary" : "text-muted-foreground/60"}`}>
                                            {isActive ? state.currentAction : "System Inactive"}
                                        </p>
                                    </div>

                                    {/* Right: Condensed Log */}
                                    <div className="md:w-72 bg-black/[0.03] p-5 rounded-[1.5rem] border border-border/40">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3 block">Activity Feed</span>
                                        <div className="max-h-[50px] overflow-y-auto custom-scrollbar">
                                            {(!state?.logs || state.logs.length === 0) ? (
                                                <p className="text-[11px] text-muted-foreground/40 font-medium italic">No activity logs recorded.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {state.logs.slice(-2).map((log, i) => (
                                                        <div key={i} className="flex items-start gap-2.5 text-[11px] font-medium text-foreground/70 leading-tight">
                                                            <span className="text-primary/50 mt-1">•</span>
                                                            <span className="truncate">{log}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
}
