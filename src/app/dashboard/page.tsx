"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { ArrowUpRight, Users, MessageSquare, Zap, Activity, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface StatData {
    accounts: any[];
    totalKarma: number;
    activeAccountsCount: number;
    totalReplies: number;
    recentActivity: any[];
}

export default function DashboardHome() {
    const { data: session } = useSession();
    const user = session?.user;

    const [data, setData] = useState<StatData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/stats");
                if (res.ok) {
                    const statsData = await res.json();
                    setData(statsData);
                }
            } catch (error) {
                console.error("Error fetching dashboard stats:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    const stats = [
        { title: "Total Karma", value: data?.totalKarma.toLocaleString() || "0", icon: Zap, trend: "+12.5%", color: "text-yellow-400" },
        { title: "Active Accounts", value: data?.activeAccountsCount.toString() || "0", icon: Users, trend: "Stable", color: "text-blue-400" },
        { title: "Auto-replies", value: data?.totalReplies.toString() || "0", icon: MessageSquare, trend: "+34.1%", color: "text-purple-400" },
        { title: "System Status", value: "Healthy", icon: Activity, trend: "99.9% Uptime", color: "text-green-400" },
    ];

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back, {user?.name?.split(' ')[0] || 'User'}!</h1>
                <p className="text-muted-foreground">Here is what's happening with your accounts today.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-panel p-6 rounded-2xl relative overflow-hidden group border border-border"
                    >
                        <div className={`absolute top-0 right-0 p-4 opacity-10 ${stat.color} group-hover:scale-110 transition-transform duration-500`}>
                            <stat.icon className="w-16 h-16" />
                        </div>

                        <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                        <h3 className="text-3xl font-bold text-foreground mb-4">{isLoading ? "..." : stat.value}</h3>

                        <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                            <ArrowUpRight className="w-4 h-4" />
                            <span>{stat.trend}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-border">
                    <h3 className="text-lg font-bold text-foreground mb-6">Recent Activity</h3>

                    <div className="space-y-4">
                        {isLoading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)
                        ) : data?.recentActivity.length === 0 ? (
                            <p className="text-muted-foreground text-center py-10">No recent activity found.</p>
                        ) : (
                            data?.recentActivity.map((activity, i) => (
                                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-border hover:bg-secondary/50 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                        <MessageSquare className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-foreground text-sm font-medium">Auto-reply posted</p>
                                        <p className="text-muted-foreground text-xs mt-1">Account <span className="text-primary font-medium">@{activity.redditAccount.username}</span> replied to a lead. Click to view on Reddit.</p>
                                        <p className="text-xs text-muted-foreground/60 mt-2">{new Date(activity.postedAt).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-border">
                    <h3 className="text-lg font-bold text-foreground mb-6">Account Status</h3>

                    {isLoading ? (
                        <div className="space-y-4 animate-pulse">
                            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl" />)}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {data?.accounts?.slice(0, 5).map(acc => (
                                <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                            {acc.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground truncate max-w-[100px] sm:max-w-none">{acc.username}</p>
                                            <p className="text-xs text-muted-foreground">{acc.karma} karma</p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${acc.status === 'active' || acc.status === 'ready' ? 'bg-green-500/20 text-green-400 border border-green-500/20' :
                                        acc.status === 'warming' || acc.status === 'warmup' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20' :
                                            'bg-red-500/20 text-red-400 border border-red-500/20'
                                        }`}>
                                        {acc.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
