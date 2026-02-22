"use client";

import { useState, useEffect } from "react";
import {
    Plus, Trash2, Bot, Save, Search, Loader2,
    ExternalLink, MessageSquare, Globe, Sparkles,
    Target, Palette, FileText, ChevronLeft, Check,
    AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Lead {
    id: string;
    redditId: string;
    title: string;
    subreddit: string;
    url: string;
    relevanceScore: number;
    aiAnalysis: string;
    status: string;
    createdAt: string;
}

interface Project {
    id: string;
    name: string;
    websiteUrl?: string;
    websiteDescription?: string;
    description?: string;
    replyTone?: string;
    mentionType?: string;
    targetSubreddits?: string;
}

export default function AutoReplyPage() {
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectName, setProjectName] = useState("");
    const [leads, setLeads] = useState<Lead[]>([]);
    const [isLoadingLeads, setIsLoadingLeads] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<any>(null);
    const [debugMode, setDebugMode] = useState(false);

    // Stepper State (from discovery/page.tsx)
    const [step, setStep] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [analysis, setAnalysis] = useState<{ description: string, keywords: string[], top5: string[] } | null>(null);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
    const [discoveredSubs, setDiscoveredSubs] = useState<string[]>([]);
    const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
    const [customSub, setCustomSub] = useState("");
    const [replyTone, setReplyTone] = useState("Friendly");
    const [mentionType, setMentionType] = useState("URL");
    const [finalDescription, setFinalDescription] = useState("");

    useEffect(() => {
        const init = async () => {
            try {
                // Fetch accounts first
                const accRes = await fetch("/api/accounts/reddit");
                const accData = await accRes.json();
                setAccounts(accData);
                if (accData.length > 0) setSelectedAccount(accData[0]);

                const projRes = await fetch("/api/projects");
                const projData = await projRes.json();
                if (projData.projects && projData.projects.length > 0) {
                    const p = projData.projects[0];
                    setProjectId(p.id);
                    setProjectName(p.name);

                    const isConfigured = p.websiteUrl && p.targetSubreddits && p.targetSubreddits !== "[]";
                    if (isConfigured) {
                        setWebsiteUrl(p.websiteUrl || "");
                        setReplyTone(p.replyTone || "Friendly");
                        setMentionType(p.mentionType || "URL");
                        setFinalDescription(p.websiteDescription || "");
                        const kws = p.description ? p.description.split(",").map((k: string) => k.trim()).filter(Boolean) : [];
                        setSelectedKeywords(kws);
                        try {
                            const subs = JSON.parse(p.targetSubreddits || "[]");
                            setSelectedSubs(subs);
                            setDiscoveredSubs(subs);
                        } catch (e) { }

                        setStep(6); // Configuration active
                        fetchLeads(p.id);
                    } else {
                        setStep(0); // Start onboarding
                    }
                }
            } catch (error) {
                toast.error("Failed to load project data");
            } finally {
                setIsLoadingLeads(false);
            }
        };
        init();
    }, []);

    const fetchLeads = async (id: string) => {
        setIsLoadingLeads(true);
        try {
            const res = await fetch(`/api/discovery/leads?projectId=${id}`);
            const data = await res.json();
            if (res.ok) setLeads(data.leads || []);
        } catch (error) {
            console.error("Fetch leads error:", error);
        } finally {
            setIsLoadingLeads(false);
        }
    };

    // --- Logic from discovery/page.tsx ---

    const analyzeWebsite = async () => {
        if (!websiteUrl) return toast.error("Please enter a website URL");
        setLoading(true);
        try {
            const res = await fetch("/api/analyze/website", {
                method: "POST",
                body: JSON.stringify({ url: websiteUrl })
            });
            const data = await res.json();
            if (data.success) {
                setAnalysis({ description: data.description, keywords: data.keywords, top5: data.top5 });
                setFinalDescription(data.description);
                setSelectedKeywords(data.top5);
                setStep(1);
            } else {
                toast.error(data.error || "Analysis failed");
            }
        } catch (e) {
            toast.error("Cloud connection failed");
        } finally {
            setLoading(false);
        }
    };

    const discoverSubreddits = async () => {
        if (selectedKeywords.length === 0) return toast.error("Select at least one keyword");
        setLoading(true);
        try {
            const res = await fetch("/api/analyze/subreddits", {
                method: "POST",
                body: JSON.stringify({ keywords: selectedKeywords })
            });
            const data = await res.json();
            if (data.success) {
                setDiscoveredSubs(data.subreddits);
                setSelectedSubs(data.subreddits.slice(0, 8));
                setStep(2);
            }
        } catch (e) {
            toast.error("Subreddit discovery failed");
        } finally {
            setLoading(false);
        }
    };

    const saveSetup = async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: projectName,
                    websiteUrl,
                    websiteDescription: finalDescription,
                    description: selectedKeywords.join(", "),
                    replyTone,
                    mentionType,
                    targetSubreddits: JSON.stringify(selectedSubs)
                })
            });
            if (res.ok) {
                toast.success("Setup Complete! Bot Activated.");
                setStep(6);
                fetchLeads(projectId);
            } else {
                const errData = await res.json();
                toast.error(errData.error || "Failed to update project settings");
            }
        } catch (e) {
            toast.error("Network error during save");
        } finally {
            setLoading(false);
        }
    };

    const startScan = async () => {
        if (!projectId) return;
        setIsScanning(true);
        toast.info("Starting AI scan for lead mentions...");
        try {
            const res = await fetch("/api/discovery/scan", {
                method: "POST",
                body: JSON.stringify({ projectId, debugMode, accountId: selectedAccount?.id })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success("Scan completed!", { description: data.message });
                fetchLeads(projectId);
            } else {
                const data = await res.json();
                toast.error(data.error || "Scan failed");
            }
        } catch (err) {
            toast.error("Scan failed to complete");
        } finally {
            setIsScanning(false);
        }
    };

    const toggleKeyword = (kw: string) => {
        setSelectedKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);
    };

    const toggleSub = (sub: string) => {
        setSelectedSubs(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]);
    };

    const addCustomSub = () => {
        if (!customSub) return;
        const clean = customSub.replace("r/", "").trim();
        if (!selectedSubs.includes(clean)) {
            setSelectedSubs([...selectedSubs, clean]);
            if (!discoveredSubs.includes(clean)) setDiscoveredSubs([...discoveredSubs, clean]);
        }
        setCustomSub("");
    };

    const resetConfiguration = async () => {
        if (!confirm("Are you sure? This will clear all website settings for this project.")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    websiteUrl: "",
                    websiteDescription: "",
                    description: "",
                    replyTone: "Friendly",
                    targetSubreddits: "[]"
                })
            });
            if (res.ok) {
                toast.success("Configuration cleared.");
                setStep(0);
                setWebsiteUrl("");
                setAnalysis(null);
                setDiscoveredSubs([]);
                setSelectedSubs([]);
                setFinalDescription("");
            }
        } catch (e) {
            toast.error("Failed to reset configuration");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-foreground mb-2">Auto-Reply & Discovery</h1>
                    <div className="flex items-center gap-3">
                        <p className="text-muted-foreground text-sm">AI automatically finds and replies to mentions of your site.</p>
                        {accounts.length > 0 && (
                            <div className="flex items-center gap-2 bg-secondary/40 border border-border px-3 py-1.5 rounded-xl ml-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Using:</span>
                                <select
                                    className="bg-transparent text-sm font-bold border-none outline-none text-primary cursor-pointer pr-2"
                                    value={selectedAccount?.id || ""}
                                    onChange={(e) => setSelectedAccount(accounts.find(a => a.id === e.target.value))}
                                >
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id} className="bg-background text-foreground">@{acc.username}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex items-center gap-4 bg-secondary/30 border border-border/50 px-4 py-2 rounded-2xl ml-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Debug Mode</span>
                                <span className="text-[10px] font-bold text-foreground">Visible Browser</span>
                            </div>
                            <button
                                onClick={() => setDebugMode(!debugMode)}
                                className={`w-10 h-5 rounded-full transition-all duration-300 relative ${debugMode ? 'bg-primary' : 'bg-muted'}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${debugMode ? 'left-5.5' : 'left-0.5'}`}></div>
                            </button>
                        </div>
                    </div>

                    {selectedAccount && selectedAccount.karma < 100 && (
                        <motion.div
                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 mt-4 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 max-w-2xl"
                        >
                            <AlertCircle className="shrink-0 w-5 h-5 text-yellow-500" />
                            <div className="text-sm">
                                <span className="font-bold">Karma Protection Warning:</span> It is recommended to have at least <span className="underline font-bold">100 karma</span> before running discovery. Current: <span className="font-black">{selectedAccount.karma}</span>.
                            </div>
                        </motion.div>
                    )}

                    {step === 6 && (
                        <div className="flex items-center gap-3 mt-4">
                            <button
                                onClick={() => setStep(7)}
                                className="text-sm font-medium text-foreground bg-secondary/50 hover:bg-secondary border border-border px-4 py-2 rounded-xl transition-all"
                            >
                                Edit Setup
                            </button>
                            <button
                                onClick={startScan}
                                disabled={isScanning}
                                className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-primary-foreground font-medium hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 ${isScanning ? 'bg-primary/50' : 'bg-primary hover:shadow-primary/20'}`}
                            >
                                {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Scan for Leads
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Configuration Tool (Left) */}
                <div className="lg:col-span-12 xl:col-span-7 space-y-6">
                    {step < 5 && (
                        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === i ? 'bg-primary text-white shadow-lg shadow-primary/20' : step > i ? 'bg-green-500/20 text-green-500 border border-green-500/20' : 'bg-secondary text-muted-foreground'}`}>
                                        {step > i ? <Check className="w-4 h-4" /> : i + 1}
                                    </div>
                                    {i < 4 && <div className={`w-8 h-0.5 mx-2 ${step > i ? 'bg-green-500/20' : 'bg-secondary'}`} />}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="glass-panel p-8 rounded-3xl border border-border min-h-[500px] flex flex-col justify-center relative overflow-hidden">
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/5 rounded-full blur-[80px] pointer-events-none"></div>

                        {step === 0 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center max-w-md mx-auto w-full">
                                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-6">
                                    <Globe className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-2xl font-bold text-foreground mb-3">Start with your website</h2>
                                <p className="text-muted-foreground mb-8">Enter your project's URL and AI will analyze your niche automatically.</p>
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                        placeholder="https://your-product.com"
                                        className="w-full bg-secondary/30 border border-border rounded-xl px-4 py-3 text-foreground-light focus:border-primary outline-none transition-all text-center"
                                    />
                                    <button
                                        onClick={analyzeWebsite}
                                        disabled={loading}
                                        className="w-full bg-primary text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50"
                                    >
                                        {loading ? "AI is Analyzing..." : "Analyze Website & Generate Keywords"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-yellow-500/10 rounded-2xl"><Sparkles className="w-6 h-6 text-yellow-500" /></div>
                                    <div>
                                        <h2 className="text-xl font-bold">Target Keywords</h2>
                                        <p className="text-sm text-muted-foreground">Select keywords for AI to monitor.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-8">
                                    {analysis?.keywords.map(kw => (
                                        <button key={kw} onClick={() => toggleKeyword(kw)} className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all text-left flex items-center justify-between ${selectedKeywords.includes(kw) ? "bg-primary/20 border-primary text-primary" : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/50"}`}>
                                            {kw} {selectedKeywords.includes(kw) && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(0)} className="flex-1 px-6 py-3.5 rounded-xl border border-border font-bold hover:bg-secondary transition-all">Back</button>
                                    <button onClick={discoverSubreddits} disabled={loading || selectedKeywords.length === 0} className="flex-[2] bg-primary text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50">
                                        {loading ? "Finding Subreddits..." : "Next: Find Subreddits"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-blue-500/10 rounded-2xl"><Target className="w-6 h-6 text-blue-500" /></div>
                                    <div>
                                        <h2 className="text-xl font-bold">Target Subreddits</h2>
                                        <p className="text-sm text-muted-foreground">Choose where the bot will be active.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-6 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {discoveredSubs.map(sub => (
                                        <button key={sub} onClick={() => toggleSub(sub)} className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between ${selectedSubs.includes(sub) ? "bg-blue-500/20 border-blue-500 text-blue-500" : "bg-secondary/30 border-border text-muted-foreground hover:border-blue-500/50"}`}>
                                            r/{sub} {selectedSubs.includes(sub) && <Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 mb-8">
                                    <input type="text" value={customSub} onChange={(e) => setCustomSub(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addCustomSub()} placeholder="Add custom: saas" className="flex-1 bg-secondary/30 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
                                    <button onClick={addCustomSub} className="px-4 bg-secondary border border-border rounded-xl text-sm font-bold">+</button>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(1)} className="flex-1 px-6 py-3.5 rounded-xl border border-border font-bold hover:bg-secondary transition-all">Back</button>
                                    <button onClick={() => setStep(3)} className="flex-[2] bg-primary text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">Next: Define Style</button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-purple-500/10 rounded-2xl"><Palette className="w-6 h-6 text-purple-500" /></div>
                                    <div>
                                        <h2 className="text-xl font-bold">Bot Personality</h2>
                                        <p className="text-sm text-muted-foreground">Control the AI's reply tone.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-8">
                                    {["Friendly", "Professional", "Helpful", "Funny", "Casual", "Technical"].map(t => (
                                        <button key={t} onClick={() => setReplyTone(t)} className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all ${replyTone === t ? "bg-purple-500/20 border-purple-500 text-purple-500" : "bg-secondary/30 border-border text-muted-foreground"}`}>{t}</button>
                                    ))}
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(2)} className="flex-1 px-6 py-3.5 rounded-xl border border-border font-bold hover:bg-secondary transition-all">Back</button>
                                    <button onClick={() => setStep(4)} className="flex-[2] bg-primary text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">Next: Final Review</button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 w-full">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="p-3 bg-primary/10 rounded-2xl"><FileText className="w-6 h-6 text-primary" /></div>
                                    <div>
                                        <h2 className="text-xl font-bold">Review AI Context</h2>
                                        <p className="text-sm text-muted-foreground">This is how the bot describes your project.</p>
                                    </div>
                                </div>
                                <textarea value={finalDescription} onChange={(e) => setFinalDescription(e.target.value)} rows={6} className="w-full bg-secondary/30 border border-border rounded-2xl px-5 py-4 text-sm leading-relaxed mb-6 focus:border-primary outline-none transition-all resize-none" />
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(3)} className="flex-1 px-6 py-3.5 rounded-xl border border-border font-bold hover:bg-secondary transition-all">Back</button>
                                    <button onClick={saveSetup} disabled={loading} className="flex-[2] bg-primary text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-50">{loading ? "Activating..." : "Complete Setup & Launch Bot"}</button>
                                </div>
                            </div>
                        )}

                        {(step === 6 || step === 7) && (
                            <div className="animate-in fade-in duration-700 w-full">
                                {step === 7 ? (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full space-y-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-xl font-bold">Project Settings</h3>
                                            <button onClick={() => setStep(6)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">Website URL</label>
                                                    <input type="text" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="w-full bg-secondary/30 border border-border rounded-xl px-4 py-2.5 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">Target Subreddits</label>
                                                    <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar border border-border/50 rounded-xl p-3 bg-secondary/20">
                                                        {discoveredSubs.map(sub => (
                                                            <button key={sub} onClick={() => toggleSub(sub)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all text-left flex items-center justify-between ${selectedSubs.includes(sub) ? "bg-blue-500/20 border-blue-500 text-blue-500" : "bg-secondary text-muted-foreground border-transparent"}`}>r/{sub}</button>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        <input type="text" value={customSub} onChange={(e) => setCustomSub(e.target.value)} placeholder="Add subreddit..." className="flex-1 bg-secondary/30 border border-border rounded-lg px-3 py-2 text-[10px] outline-none" />
                                                        <button onClick={addCustomSub} className="bg-secondary border border-border text-foreground px-3 py-2 rounded-lg text-[10px] font-bold">+</button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">Tone</label>
                                                        <select value={replyTone} onChange={(e) => setReplyTone(e.target.value)} className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-sm">
                                                            {["Friendly", "Professional", "Casual", "Technical", "Educational", "Funny"].map(t => (<option key={t} value={t}>{t}</option>))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">Mention Type</label>
                                                        <select value={mentionType} onChange={(e) => setMentionType(e.target.value)} className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-sm">
                                                            {["URL", "Brand", "Both"].map(m => (<option key={m} value={m}>{m}</option>))}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">Project Keywords</label>
                                                    <div className="flex flex-wrap gap-2 border border-border/50 rounded-xl p-3 bg-secondary/20 max-h-[120px] overflow-y-auto">
                                                        {analysis?.keywords.map(kw => (
                                                            <button key={kw} onClick={() => toggleKeyword(kw)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${selectedKeywords.includes(kw) ? "bg-primary/20 border-primary text-primary" : "bg-secondary text-muted-foreground border-transparent"}`}>{kw}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground mb-1 block">AI Context</label>
                                                    <textarea value={finalDescription} onChange={(e) => setFinalDescription(e.target.value)} rows={5} className="w-full bg-secondary/30 border border-border rounded-xl px-4 py-3 text-xs leading-relaxed resize-none" />
                                                </div>
                                            </div>
                                            <div className="col-span-1 md:col-span-2 flex gap-4 pt-4">
                                                <button onClick={resetConfiguration} className="flex-1 py-3 rounded-xl text-red-400 font-bold bg-red-400/5 border border-red-400/20 hover:bg-red-400/10 transition-all text-sm">Reset Setup</button>
                                                <button onClick={saveSetup} disabled={loading} className="flex-[2] py-3 bg-primary text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm">{loading ? "Saving..." : "💾 Save Changes"}</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <div className="w-10 h-10 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                                        <h2 className="text-2xl font-bold mb-2">Bot is Active</h2>
                                        <p className="text-muted-foreground mb-8">Monitoring <b>{selectedSubs.length} subreddits</b> for <b>{selectedKeywords.slice(0, 3).join(", ")}...</b></p>
                                        <div className="bg-secondary/50 rounded-2xl p-6 border border-border inline-block text-left w-full max-w-sm mx-auto">
                                            <p className="text-xs font-black uppercase text-muted-foreground mb-3 tracking-widest">Configuration</p>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Website:</span><span className="font-medium truncate max-w-[150px]">{websiteUrl}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tone:</span><span className="font-medium">{replyTone}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subreddits:</span><span className="font-medium">{selectedSubs.length} targeted</span></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Leads Section (Right) */}
                <div className="lg:col-span-12 xl:col-span-5">
                    <div className="glass-panel p-6 rounded-2xl border border-border h-full flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-foreground">Discovered Leads</h3>
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-bold">{leads.length} Found</span>
                        </div>
                        <div className="space-y-4 flex-1 overflow-y-auto max-h-[700px] pr-2 custom-scrollbar">
                            {isLoadingLeads ? (
                                <div className="py-20 text-center">
                                    <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-4 opacity-50" />
                                    <p className="text-muted-foreground text-sm">Loading leads...</p>
                                </div>
                            ) : leads.length === 0 ? (
                                <div className="py-20 text-center px-6">
                                    <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4 border border-primary/10"><Search className="w-8 h-8 text-primary opacity-20" /></div>
                                    <h4 className="text-foreground font-bold mb-1">No Leads Found</h4>
                                    <p className="text-muted-foreground text-sm">Run a scan to find relevant posts.</p>
                                </div>
                            ) : (
                                leads.map((lead) => (
                                    <div key={lead.id} className="p-4 rounded-xl bg-secondary/20 border border-border group transition-all hover:border-primary/20">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">r/{lead.subreddit}</span>
                                            <span className="text-[10px] text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground mb-2 line-clamp-2 leading-tight group-hover:text-primary transition-colors">{lead.title}</h4>
                                        <div className="mt-3 bg-secondary/30 rounded-lg p-2.5 border border-border">
                                            <p className="text-[10px] text-muted-foreground line-clamp-2 italic">{lead.aiAnalysis ? (lead.aiAnalysis.split('}:')[1] || lead.aiAnalysis) : "Pending analysis..."}</p>
                                        </div>
                                        <div className="flex items-center gap-2 mt-4">
                                            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border hover:bg-secondary text-xs font-semibold text-foreground transition-all">View Post <ExternalLink className="w-3 h-3" /></a>
                                            <button className="inline-flex items-center justify-center p-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"><MessageSquare className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
