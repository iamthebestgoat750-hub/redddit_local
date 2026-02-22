"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Save, User as UserIcon, Mail, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
    const { data: session, update } = useSession();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch("/api/user/profile");
                if (res.ok) {
                    const data = await res.json();
                    setName(data.name || "");
                    setEmail(data.email || "");
                }
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return toast.error("Name cannot be empty");

        setIsSaving(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email }),
            });

            if (res.ok) {
                // IMPORTANT: Sync with NextAuth session so sidebar updates immediately
                await update({ name });
                toast.success("Profile updated and synced!");
            } else {
                const data = await res.json();
                throw new Error(data.error || "Failed to update profile");
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-xl font-semibold text-white">Settings</h2>
                <p className="text-sm text-[#718096]">Manage your account and preferences</p>
            </div>

            {/* Profile */}
            <form onSubmit={handleSave} className="bg-white/[0.03] rounded-2xl border border-white/5 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <UserIcon className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-white">Profile</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1.5 uppercase tracking-wider">Full Name</label>
                        <div className="relative">
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-950/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-foreground text-sm placeholder-slate-400 dark:placeholder-[#718096] focus:outline-none focus:border-primary/50 transition-all"
                                placeholder="Your name"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground font-medium block mb-1.5 uppercase tracking-wider">Email Address</label>
                        <div className="relative">
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-950/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-foreground text-sm placeholder-slate-400 dark:placeholder-[#718096] focus:outline-none focus:border-primary/50 transition-all opacity-80 cursor-not-allowed"
                                placeholder="your@email.com"
                                readOnly
                            />
                            <p className="mt-1.5 text-[10px] text-muted-foreground italic">Email changes are currently restricted for security.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* Danger Zone */}
            <div className="bg-red-500/5 rounded-2xl border border-red-500/10 p-6">
                <h3 className="text-base font-semibold text-[#FF5252] mb-2">Danger Zone</h3>
                <p className="text-xs text-[#718096] mb-4">Irreversible actions for your account</p>
                <button
                    type="button"
                    className="text-sm text-[#FF5252] border border-[#FF5252]/20 hover:bg-[#FF5252]/10 px-6 py-2.5 rounded-xl transition-all font-medium"
                >
                    Delete Account
                </button>
            </div>
        </div>
    );
}
