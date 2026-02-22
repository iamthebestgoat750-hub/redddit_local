"use client";

import { useState, useEffect } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { DownloadCloud, Loader2 } from "lucide-react";

export default function AnalyticsPage() {
    const [data, setData] = useState<any>(null);
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
                console.error("Error fetching analytics stats:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">Analytics Overview</h1>
                    <p className="text-muted-foreground">Track your Reddit growth and engagement metrics.</p>
                </div>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground hover:bg-secondary transition-colors text-sm font-medium">
                    <DownloadCloud className="w-4 h-4" /> Export Report
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="glass-panel p-6 rounded-2xl border border-border">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-foreground">Karma Growth (7 Days)</h3>
                        <p className="text-sm text-muted-foreground">Total karma accumulated across all accounts.</p>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data?.karmaChart || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorKarma" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" vertical={false} />
                                <XAxis dataKey="name" stroke="#00000050" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#00000050" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderColor: '#00000010', borderRadius: '12px', color: '#000' }}
                                    itemStyle={{ color: '#8b5cf6' }}
                                />
                                <Area type="monotone" dataKey="karma" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorKarma)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-border">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-foreground">Engagement by Subreddit</h3>
                        <p className="text-sm text-muted-foreground">Where your bot is most active.</p>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data?.engagementChart || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" vertical={false} />
                                <XAxis dataKey="name" stroke="#00000050" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#00000050" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: '#00000005' }}
                                    contentStyle={{ backgroundColor: '#fff', borderColor: '#00000010', borderRadius: '12px', color: '#000' }}
                                />
                                <Bar dataKey="replies" name="Auto Replies" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="posts" name="Posts" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-border">
                <h3 className="text-lg font-bold text-foreground mb-6">Recent Campaigns Performance</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-sm text-muted-foreground border-b border-border">
                                <th className="pb-3 font-medium">Account</th>
                                <th className="pb-3 font-medium">Karma</th>
                                <th className="pb-3 font-medium">Status</th>
                                <th className="pb-3 font-medium text-right">Activity</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {(data?.accounts || []).map((acc: any) => (
                                <tr key={acc.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                                    <td className="py-4 text-foreground font-medium">@{acc.username}</td>
                                    <td className="py-4 text-foreground/80">{acc.karma?.toLocaleString()}</td>
                                    <td className="py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${acc.status === 'active' || acc.status === 'ready' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'
                                            }`}>
                                            {acc.status}
                                        </span>
                                    </td>
                                    <td className="py-4 text-primary text-right font-medium">Active</td>
                                </tr>
                            ))}
                            {data?.accounts.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-10 text-center text-muted-foreground">No accounts found to analyze.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
