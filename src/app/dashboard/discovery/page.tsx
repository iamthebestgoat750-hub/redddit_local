"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
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

export default function MentionsPage() {
    const { data: session } = useSession();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");
    const [projectName, setProjectName] = useState("");

    // Step-based onboarding state
    // 0: URL, 1: Keywords, 2: Subreddits, 3: Style, 4: Website Details, 5: Success, 6: Dashboard, 7: Settings
    const [step, setStep] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [debugMode, setDebugMode] = useState(false);

    // Website Analysis Data
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [analysis, setAnalysis] = useState<{ description: string, keywords: string[], top5: string[] } | null>(null);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

    // Subreddit Discovery Data
    const [discoveredSubs, setDiscoveredSubs] = useState<string[]>([]);
    const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
    const [customSub, setCustomSub] = useState("");

    // Style Data
    const [replyTone, setReplyTone] = useState("Friendly");
    const [mentionType, setMentionType] = useState("URL");

    // Website Details (Final Editable)
    const [finalDescription, setFinalDescription] = useState("");

    // Dashboard Data
    const [leads, setLeads] = useState<Lead[]>([]);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await fetch("/api/projects");
            const data = await res.json();
            const projectList = data.projects || [];
            setProjects(projectList);

            if (projectList.length > 0) {
                const p = projectList[0];
                console.log("[DEBUG] Project Data:", p);
                setSelectedProjectId(p.id);
                setProjectName(p.name);

                // Robust check: websiteUrl should exist and targetSubreddits shouldn't be null/empty
                const isConfigured = p.websiteUrl &&
                    p.targetSubreddits &&
                    p.targetSubreddits !== "[]" &&
                    p.targetSubreddits !== "";

                if (isConfigured) {
                    setWebsiteUrl(p.websiteUrl);
                    setReplyTone(p.replyTone || "Friendly");
                    setMentionType(p.mentionType || "URL");
                    setFinalDescription(p.websiteDescription || "");

                    const kws = p.description ? p.description.split(",").map((k: string) => k.trim()).filter(Boolean) : [];
                    setSelectedKeywords(kws);

                    try {
                        const subs = JSON.parse(p.targetSubreddits);
                        setSelectedSubs(subs);
                        setDiscoveredSubs(subs);
                    } catch (e) { }

                    // Pre-fill analysis object so Step 1 shows current keywords
                    setAnalysis({
                        description: p.websiteDescription || "",
                        keywords: kws,
                        top5: kws.slice(0, 5)
                    });

                    setStep(6);
                    fetchLeads(p.id);
                }
            }
        } catch (e) {
            console.error("Failed to fetch projects");
        }
    };

    const fetchLeads = async (projectId: string) => {
        try {
            const res = await fetch(`/api/discovery/leads?projectId=${projectId}`);
            const data = await res.json();
            setLeads(data.leads || []);
        } catch (e) {
            console.error("Failed to fetch leads");
        }
    };

    // Step 1: Analyze Website
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
                setAnalysis({
                    description: data.description,
                    keywords: data.keywords,
                    top5: data.top5
                });
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

    // Step 2: Discover Subreddits
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
                setSelectedSubs(data.subreddits.slice(0, 8)); // Pre-select first 8
                setStep(2);
            }
        } catch (e) {
            toast.error("Subreddit discovery failed");
        } finally {
            setLoading(false);
        }
    };

    const resetConfiguration = async () => {
        if (!confirm("Are you sure? This will clear all website settings for this project.")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${selectedProjectId}`, {
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

    const saveSetup = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${selectedProjectId}`, {
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
                // Jump directly to dashboard for immediate value
                fetchProjects();
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
        setScanning(true);
        toast.info(debugMode ? "Starting AI scan (Debug Mode)..." : "Starting AI scan for mentions...");
        try {
            const res = await fetch("/api/discovery/scan", {
                method: "POST",
                body: JSON.stringify({
                    projectId: selectedProjectId,
                    debugMode: debugMode
                })
            });
            if (res.ok) {
                toast.success("Scan completed!");
                fetchLeads(selectedProjectId);
            } else {
                const data = await res.json();
                toast.error(data.error || "Scan failed");
            }
        } catch (err) {
            toast.error("Scan failed to complete");
        } finally {
            setScanning(false);
        }
    };

    const toggleKeyword = (kw: string) => {
        setSelectedKeywords(prev =>
            prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]
        );
    };

    const toggleSub = (sub: string) => {
        setSelectedSubs(prev =>
            prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
        );
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

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20 px-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-foreground mb-1 tracking-tight">Post Discovery</h1>
                    <p className="text-muted-foreground text-sm font-medium">Find relevant Reddit discussions using AI.</p>
                </div>

                <div className="flex items-center gap-4 bg-secondary/30 border border-border/50 px-4 py-2 rounded-2xl">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Debug Mode</span>
                        <span className="text-[10px] font-bold text-foreground">Visible Browser</span>
                    </div>
                    <button
                        onClick={() => setDebugMode(!debugMode)}
                        className={`w-10 h-5 rounded-full transition-all duration-300 relative ${debugMode ? 'bg-primary' : 'bg-muted'}`}
                    >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ${debugMode ? 'left-5.5' : 'left-0.5'}`} />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {step > 0 && step < 6 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-all bg-secondary/50 px-4 py-2 rounded-lg border border-border"
                        >
                            ← Back
                        </button>
                    )}
                    {step === 6 && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setStep(7)}
                                className="text-xs font-bold text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-all border border-white/5"
                            >
                                ✏️ Edit Setup
                            </button>
                            <button
                                onClick={resetConfiguration}
                                className="text-xs font-bold text-red-400 bg-red-400/5 hover:bg-red-400/10 px-4 py-2 rounded-lg transition-all border border-red-400/10"
                            >
                                🗑️ Reset / Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Step 0: Website Analysis */}
            {
                step === 0 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-8 shadow-2xl">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-gradient-to-br from-[#6C5CE7] to-[#8E44AD] rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-[#6C5CE7]/20">
                                🌐
                            </div>
                            <h2 className="text-xl font-bold text-white">Start with your website</h2>
                            <p className="text-[#718096] text-sm mt-2">Enter your URL and AI will analyze your niche automatically.</p>
                        </div>

                        <div className="space-y-4">
                            <input
                                type="text"
                                value={websiteUrl}
                                onChange={(e) => setWebsiteUrl(e.target.value)}
                                placeholder="https://ti84calconline.com"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white text-lg focus:border-[#6C5CE7]/50 focus:ring-1 focus:ring-[#6C5CE7]/50 outline-none transition-all"
                            />
                            <button
                                disabled={loading}
                                onClick={analyzeWebsite}
                                className={`w-full font-bold py-4 rounded-2xl transition-all shadow-xl disabled:opacity-50 ${analysis ? "bg-white/5 text-[#718096] border border-white/10 mt-2" : "bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white shadow-[#6C5CE7]/20"
                                    }`}
                            >
                                {loading ? "Analyzing..." : analysis ? "Re-Analyze Website (AI)" : "Analyze Website & Generate Keywords"}
                            </button>

                            {analysis && !loading && (
                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white font-bold py-4 rounded-2xl hover:scale-[1.01] transition-all shadow-xl shadow-[#6C5CE7]/20 mt-4"
                                >
                                    Continue to Keywords →
                                </button>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Step 1: Keyword Selection */}
            {
                step === 1 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-500">
                        <div className="flex items-start gap-6 mb-8">
                            <div className="w-12 h-12 bg-[#FDCB6E]/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                                ✨
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Select Target Keywords</h2>
                                <p className="text-[#718096] text-sm mt-1">AI found these keywords. Select up to 5 for best targeting.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-8">
                            {analysis?.keywords.map(kw => (
                                <button
                                    key={kw}
                                    onClick={() => toggleKeyword(kw)}
                                    className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all text-left flex items-center justify-between ${selectedKeywords.includes(kw)
                                        ? "bg-[#6C5CE7] border-[#6C5CE7] text-white shadow-lg shadow-[#6C5CE7]/20"
                                        : "bg-white/5 border-white/10 text-[#718096] hover:border-white/20"
                                        }`}
                                >
                                    {kw}
                                    {selectedKeywords.includes(kw) && <span>✓</span>}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={discoverSubreddits}
                            disabled={loading || selectedKeywords.length === 0}
                            className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white font-bold py-4 rounded-2xl hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-[#6C5CE7]/20"
                        >
                            {loading ? "Finding relevant subreddits..." : "Next: Find Target Subreddits"}
                        </button>
                    </div>
                )
            }

            {/* Step 2: Subreddit Discovery */}
            {
                step === 2 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-500">
                        <div className="flex items-start gap-6 mb-8">
                            <div className="w-12 h-12 bg-[#00D2FF]/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                                🎯
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Choose Targeted Subreddits</h2>
                                <p className="text-[#718096] text-sm mt-1">Select where AI should look for website mentions.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {discoveredSubs.map(sub => (
                                <button
                                    key={sub}
                                    onClick={() => toggleSub(sub)}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between ${selectedSubs.includes(sub)
                                        ? "bg-[#00D2FF] border-[#00D2FF] text-[#0A0A1B]"
                                        : "bg-white/5 border-white/10 text-[#718096] hover:border-white/20"
                                        }`}
                                >
                                    r/{sub}
                                    {selectedSubs.includes(sub) && <span>✓</span>}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2 mb-8">
                            <input
                                type="text"
                                value={customSub}
                                onChange={(e) => setCustomSub(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addCustomSub()}
                                placeholder="Add custom: e.g. saas"
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs outline-none focus:border-[#00D2FF]/50"
                            />
                            <button
                                onClick={addCustomSub}
                                className="bg-[#00D2FF]/10 text-[#00D2FF] px-4 py-2 rounded-xl text-xs font-bold border border-[#00D2FF]/20"
                            >
                                + Add
                            </button>
                        </div>

                        <button
                            onClick={() => setStep(3)}
                            className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white font-bold py-4 rounded-2xl hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-[#6C5CE7]/20"
                        >
                            Next: Define Reply Style
                        </button>
                    </div>
                )
            }

            {/* Step 3: Identity & Style */}
            {
                step === 3 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-500">
                        <div className="flex items-start gap-6 mb-8">
                            <div className="w-12 h-12 bg-[#6C5CE7]/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                                🎭
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Define AI Personality</h2>
                                <p className="text-[#718096] text-sm mt-1">Control how the bot replies to mentions.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-8">
                            {["Friendly", "Professional", "Casual", "Technical", "Educational", "Funny", "Persuasive", "Helpful"].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setReplyTone(t)}
                                    className={`px-4 py-3 rounded-xl text-xs font-bold border transition-all ${replyTone === t
                                        ? "bg-[#6C5CE7] border-[#6C5CE7] text-white"
                                        : "bg-white/5 border-white/10 text-[#718096] hover:border-white/20"
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setStep(4)}
                            className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white font-bold py-4 rounded-2xl hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-[#6C5CE7]/20"
                        >
                            Next: Website Details
                        </button>
                    </div>
                )
            }

            {/* Step 4: Website Details Review (Final Review) */}
            {
                step === 4 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-right-8 duration-500">
                        <div className="flex items-start gap-6 mb-8">
                            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-xl shrink-0">
                                📝
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Review Website Details</h2>
                                <p className="text-[#718096] text-sm mt-1">AI generated this description of your site. Edit it to ensure perfect replies.</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block">Website Analysis Result</label>
                            <textarea
                                value={finalDescription}
                                onChange={(e) => setFinalDescription(e.target.value)}
                                rows={8}
                                maxLength={1000}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white/90 text-sm leading-relaxed focus:border-[#6C5CE7]/50 outline-none transition-all resize-none"
                            />
                            <div className="text-right text-[10px] text-[#718096] font-bold">
                                {finalDescription.length}/1000 CHARACTERS
                            </div>
                        </div>

                        <button
                            onClick={saveSetup}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] text-white font-bold py-4 rounded-2xl hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-[#6C5CE7]/20"
                        >
                            {loading ? "Saving context & activating..." : "Complete Setup & Launch Bot"}
                        </button>
                    </div>
                )
            }

            {/* Step 5: Finished Success */}
            {
                step === 5 && (
                    <div className="max-w-2xl mx-auto bg-[#0F0F23] border border-white/10 rounded-3xl p-12 text-center shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                            ✓
                        </div>
                        <h2 className="text-3xl font-black text-white mb-4">Activation Success!</h2>
                        <p className="text-[#718096] max-w-md mx-auto mb-10">
                            AI bot is now configured for **{websiteUrl}**. It will start scanning Mentions in the selected subreddits automatically.
                        </p>

                        <button
                            onClick={fetchProjects}
                            className="px-10 py-4 bg-[#6C5CE7] text-white font-bold rounded-2xl hover:scale-105 transition-all shadow-xl shadow-[#6C5CE7]/20"
                        >
                            Go to Mentions Dashboard
                        </button>
                    </div>
                )
            }

            {/* Step 6: Active Dashboard */}
            {
                step === 6 && (
                    <div className="space-y-6 animate-in fade-in duration-1000">
                        {/* Stats Card */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6">
                                <p className="text-[#718096] text-xs font-black uppercase tracking-widest mb-2">Target Website</p>
                                <p className="text-white font-bold truncate">{websiteUrl}</p>
                            </div>
                            <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6">
                                <p className="text-[#718096] text-xs font-black uppercase tracking-widest mb-2">Reply Tone</p>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                    <p className="text-white font-bold">{replyTone}</p>
                                </div>
                            </div>
                            <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6 flex flex-col justify-between gap-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[#718096] text-xs font-black uppercase tracking-widest">Debug Mode</p>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={debugMode}
                                            onChange={(e) => setDebugMode(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6C5CE7]"></div>
                                    </label>
                                </div>
                                <button
                                    onClick={startScan}
                                    disabled={scanning}
                                    className="w-full py-3 bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] rounded-2xl text-white font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-[#6C5CE7]/20 disabled:opacity-50 text-sm"
                                >
                                    {scanning ? "AI Scanning..." : "🚀 Start Manual Scan"}
                                </button>
                            </div>
                        </div>

                        {/* Leads List */}
                        <div className="bg-[#0F0F23] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white">Found Mentions & Leads</h3>
                                <span className="text-xs font-bold text-[#718096] bg-white/5 px-3 py-1 rounded-full">{leads.length} found</span>
                            </div>

                            <div className="divide-y divide-white/5">
                                {leads.length === 0 ? (
                                    <div className="p-20 text-center">
                                        <div className="text-4xl mb-4">🔍</div>
                                        <p className="text-[#718096]">No mentions found yet. Try running a scan!</p>
                                    </div>
                                ) : (
                                    leads.map((lead) => (
                                        <div key={lead.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-[#6C5CE7] bg-[#6C5CE7]/10 px-2 py-0.5 rounded uppercase tracking-tighter">
                                                        r/{lead.subreddit}
                                                    </span>
                                                    {lead.relevanceScore >= 80 && (
                                                        <span className="text-[10px] font-black text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded uppercase tracking-tighter">
                                                            🔥 High Intent
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-[#718096] font-medium uppercase">{new Date(lead.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <h4 className="text-white font-bold group-hover:text-[#6C5CE7] transition-colors cursor-pointer" onClick={() => window.open(lead.url, '_blank')}>
                                                {lead.title}
                                            </h4>
                                            <div className="mt-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                                <p className="text-xs text-[#718096] leading-relaxed">
                                                    <span className="font-bold text-white/40 mr-2 uppercase">AI Analysis</span>
                                                    {lead.aiAnalysis ? (lead.aiAnalysis.split('}:')[1] || lead.aiAnalysis) : "Pending analysis..."}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Step 7: Unified Edit / Project Settings */}
            {
                step === 7 && (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-black text-white px-2">Project Settings</h2>
                            <button
                                onClick={() => setStep(6)}
                                className="text-xs font-bold text-[#718096] hover:text-white transition-all bg-white/5 px-4 py-2 rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Column: Basic Details */}
                            <div className="space-y-6">
                                <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6 space-y-4">
                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block">Website URL</label>
                                    <input
                                        type="text"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#6C5CE7]/50"
                                    />

                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block mt-4">Brand Mention Style</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {["URL", "Brand", "Both"].map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setMentionType(m)}
                                                className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${mentionType === m ? "bg-[#6C5CE7] border-[#6C5CE7] text-white" : "bg-white/5 border-white/10 text-[#718096]"}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>

                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block mt-4">Reply Tone</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {["Friendly", "Professional", "Casual", "Helpful"].map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setReplyTone(t)}
                                                className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${replyTone === t ? "bg-[#6C5CE7] border-[#6C5CE7] text-white" : "bg-white/5 border-white/10 text-[#718096]"}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6">
                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block mb-4">Target Subreddits</label>
                                    <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                        {discoveredSubs.map(sub => (
                                            <button
                                                key={sub}
                                                onClick={() => toggleSub(sub)}
                                                className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all text-left flex items-center justify-between ${selectedSubs.includes(sub) ? "bg-[#00D2FF] border-[#00D2FF] text-[#0A0A1B]" : "bg-white/5 border-white/10 text-[#718096]"}`}
                                            >
                                                r/{sub}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <input
                                            type="text"
                                            value={customSub}
                                            onChange={(e) => setCustomSub(e.target.value)}
                                            placeholder="Add subreddit..."
                                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-[10px] outline-none"
                                        />
                                        <button onClick={addCustomSub} className="bg-white/5 text-white px-3 py-2 rounded-lg text-[10px] font-bold">+</button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Content & Description */}
                            <div className="space-y-6">
                                <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6">
                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block mb-4">Keywords</label>
                                    <div className="flex flex-wrap gap-2">
                                        {analysis?.keywords.map(kw => (
                                            <button
                                                key={kw}
                                                onClick={() => toggleKeyword(kw)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${selectedKeywords.includes(kw) ? "bg-[#6C5CE7] border-[#6C5CE7] text-white" : "bg-white/5 border-white/10 text-[#718096]"}`}
                                            >
                                                {kw}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-[#0F0F23] border border-white/10 rounded-3xl p-6 space-y-4">
                                    <label className="text-[10px] font-black text-[#A0AEC0] uppercase tracking-widest block">Full Description (AI Context)</label>
                                    <textarea
                                        value={finalDescription}
                                        onChange={(e) => setFinalDescription(e.target.value)}
                                        rows={10}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white/80 text-xs leading-relaxed focus:border-[#6C5CE7]/50 outline-none transition-all resize-none"
                                    />
                                </div>

                                <button
                                    onClick={saveSetup}
                                    disabled={loading}
                                    className="w-full py-4 bg-gradient-to-r from-[#6C5CE7] to-[#8E44AD] rounded-2xl text-white font-bold hover:scale-[1.01] transition-all shadow-xl shadow-[#6C5CE7]/20"
                                >
                                    {loading ? "Updating Project..." : "💾 Save Changes"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
