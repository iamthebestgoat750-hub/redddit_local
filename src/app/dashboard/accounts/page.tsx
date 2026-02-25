"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ShieldAlert, Loader2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface RedditAccount {
    id: string;
    username: string;
    status: string;
    karma: number;
    accountAge: number;
    createdAt: string;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<RedditAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [warmingId, setWarmingId] = useState<string | null>(null);
    const [debugMode, setDebugMode] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [liveViewId, setLiveViewId] = useState<string | null>(null);
    const [liveData, setLiveData] = useState<{ screenshot: string | null; logs: string[] }>({ screenshot: null, logs: [] });
    const [isLiveLoading, setIsLiveLoading] = useState(false);

    // Fetch real accounts
    const fetchAccounts = async () => {
        try {
            const res = await fetch("/api/accounts/reddit");
            if (!res.ok) throw new Error("Failed to fetch accounts");
            const data = await res.json();
            setAccounts(data);
        } catch (error) {
            toast.error("Error loading accounts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    // Effect for live log polling
    useEffect(() => {
        if (!liveViewId) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/accounts/reddit/${liveViewId}/live`);
                if (res.ok) {
                    const data = await res.json();
                    setLiveData(data);
                }
            } catch (e) { }
        };

        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, [liveViewId]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/accounts/reddit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    debugMode: debugMode
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to add account");

            toast.success("Account connected successfully");
            setIsAdding(false);
            setNewUsername("");
            setNewPassword("");
            fetchAccounts();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to remove this account?")) return;

        setIsActionLoading(true);
        try {
            const res = await fetch(`/api/accounts/reddit/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete account");

            toast.success("Account removed");
            fetchAccounts();
        } catch (error) {
            toast.error("Failed to delete account");
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWarmup = async (id: string) => {
        setWarmingId(id);
        toast.info("Starting warmup session...");
        try {
            const res = await fetch(`/api/accounts/reddit/${id}/warmup`, {
                method: "POST",
                body: JSON.stringify({ debugMode: false }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Warmup failed");

            toast.success("Warmup session completed!");
            fetchAccounts();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setWarmingId(null);
        }
    };

    const handleRefresh = async (id: string) => {
        setRefreshingId(id);
        toast.info("Refreshing stats from Reddit...");
        try {
            const res = await fetch(`/api/accounts/reddit/${id}/refresh`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Refresh failed");
            toast.success(`Stats updated — Karma: ${data.account.karma}, Age: ${data.account.accountAge} days`);
            fetchAccounts();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setRefreshingId(null);
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Managed Accounts</h1>
                    <p className="text-muted-foreground">Add and monitor your Reddit profiles.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Add Account
                </button>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: "auto", marginBottom: 32 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="glass-panel p-6 rounded-2xl border-primary/30">
                            <h3 className="text-lg font-bold text-foreground mb-4">Connect New Account</h3>
                            <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4">
                                <input
                                    type="text"
                                    required
                                    placeholder="Reddit Username or Email"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                                />
                                <div className="flex-1 relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        placeholder="Password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-secondary border border-border rounded-xl px-4 py-3 pr-12 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-3 bg-secondary border border-border rounded-xl cursor-pointer" onClick={() => setDebugMode(!debugMode)}>
                                    <input type="checkbox" id="debugMode" checked={debugMode} onChange={(e) => setDebugMode(e.target.checked)} className="w-4 h-4 accent-primary" />
                                    <label htmlFor="debugMode" className="text-sm font-medium text-foreground cursor-pointer whitespace-nowrap">Debug Mode</label>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAdding(false)}
                                        className="px-6 py-3 rounded-xl border border-border text-foreground hover:bg-secondary transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isActionLoading}
                                        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 min-w-[140px]"
                                    >
                                        {isActionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Connect"}
                                    </button>
                                </div>
                            </form>
                            <div className="mt-4 flex items-center gap-2 text-sm text-yellow-600 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                                <ShieldAlert className="w-4 h-4" />
                                <p>We use end-to-end encryption. Your credentials are never stored in plain text.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-secondary/50">
                                <th className="p-4 text-sm font-semibold text-muted-foreground">Account</th>
                                <th className="p-4 text-sm font-semibold text-muted-foreground">Status</th>
                                <th className="p-4 text-sm font-semibold text-muted-foreground">Karma</th>
                                <th className="p-4 text-sm font-semibold text-muted-foreground">Age (Days)</th>
                                <th className="p-4 text-sm font-semibold text-muted-foreground text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            ) : accounts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted-foreground">
                                        No accounts connected yet. Add one to get started.
                                    </td>
                                </tr>
                            ) : (
                                accounts.map((acc) => (
                                    <tr key={acc.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                                    <span className="font-bold text-primary">r/</span>
                                                </div>
                                                <span className="font-medium text-foreground">{acc.username}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${acc.status === 'active' || acc.status === 'ready' ? 'bg-green-500/10 text-green-600 border border-green-500/20' :
                                                acc.status === 'warming' || acc.status === 'warmup' ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' :
                                                    'bg-red-500/10 text-red-600 border border-red-500/20'
                                                }`}>
                                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                                {acc.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-foreground/80 font-medium">{acc.karma.toLocaleString()}</td>
                                        <td className="p-4 text-foreground/80">{acc.accountAge}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {(acc.status === 'warmup' || acc.status === 'warming' || acc.status === 'connecting') && (
                                                    <button
                                                        onClick={() => {
                                                            setLiveViewId(acc.id);
                                                            setLiveData({ screenshot: null, logs: [] });
                                                        }}
                                                        className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg animate-pulse"
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary" /> LIVE
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleWarmup(acc.id)}
                                                    disabled={warmingId === acc.id || isActionLoading}
                                                    className="p-2 text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                                    title="Warmup Account"
                                                >
                                                    <RefreshCw className={`w-5 h-5 ${warmingId === acc.id ? 'animate-spin' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => handleRefresh(acc.id)}
                                                    disabled={!!refreshingId || isActionLoading}
                                                    className="p-2 text-muted-foreground hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                                    title="Refresh Stats"
                                                >
                                                    <RefreshCw className={`w-5 h-5 ${refreshingId === acc.id ? 'animate-spin' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(acc.id)}
                                                    disabled={isActionLoading}
                                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                                    title="Remove Account"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Live View Modal */}
            <AnimatePresence>
                {liveViewId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-primary/20"
                        >
                            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                    <h3 className="font-bold text-foreground">Live Browser Session: @{accounts.find(a => a.id === liveViewId)?.username}</h3>
                                </div>
                                <button
                                    onClick={() => setLiveViewId(null)}
                                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                                >
                                    <Plus className="w-5 h-5 rotate-45" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                                {/* Screenshot View */}
                                <div className="bg-black rounded-xl border border-border overflow-hidden flex items-center justify-center aspect-video relative">
                                    {liveData.screenshot ? (
                                        <img
                                            src={liveData.screenshot}
                                            alt="Live Browser View"
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Loader2 className="w-8 h-8 animate-spin" />
                                            <span className="text-xs">Waiting for screenshot...</span>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] text-white/80 border border-white/10 uppercase font-bold tracking-widest">
                                        Headless (Railway)
                                    </div>
                                </div>

                                {/* Logs View */}
                                <div className="flex flex-col bg-[#0d1117] rounded-xl border border-border overflow-hidden">
                                    <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        Browser Console Logs
                                    </div>
                                    <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 custom-scrollbar">
                                        {liveData.logs.length > 0 ? (
                                            liveData.logs.map((log, i) => (
                                                <div key={i} className="text-green-400/90 leading-relaxed break-words">
                                                    <span className="text-muted-foreground/60 mr-2 opacity-50">{i + 1}</span>
                                                    {log}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-muted-foreground/40 italic">No logs available yet...</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-secondary/20 border-t border-border flex items-center justify-between gap-4">
                                <p className="text-xs text-muted-foreground">
                                    Auto-refreshing every 3s. Debug screenshots are ephemeral.
                                </p>
                                <button
                                    onClick={() => setLiveViewId(null)}
                                    className="px-4 py-2 rounded-lg bg-secondary hover:bg-border text-foreground text-sm font-medium transition-colors"
                                >
                                    Close Monitor
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
