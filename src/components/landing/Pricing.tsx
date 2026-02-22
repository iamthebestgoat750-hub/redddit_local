"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function Pricing() {
    const plans = [
        {
            name: "Starter",
            price: "$29",
            period: "/month",
            features: ["Up to 5 Reddit Accounts", "Basic Auto-warming", "10 Keyword Monitors", "Standard Proxies", "Community Support"],
            isPopular: false
        },
        {
            name: "Growth",
            price: "$79",
            period: "/month",
            features: ["Up to 25 Reddit Accounts", "Advanced AI Warming", "50 Keyword Monitors", "Premium Residential Proxies", "Auto-reply functionality", "Priority Support"],
            isPopular: true
        },
        {
            name: "Agency",
            price: "$199",
            period: "/month",
            features: ["Unlimited Accounts", "Custom Warming Schedules", "Unlimited Monitors", "Dedicated Account Manager", "API Access", "White-label reports"],
            isPopular: false
        }
    ];

    return (
        <section id="pricing" className="py-24 relative">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Simple, <span className="gradient-text">transparent pricing</span></h2>
                    <p className="text-muted-foreground text-lg">Choose the perfect plan for your marketing needs.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center max-w-5xl mx-auto">
                    {plans.map((plan, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className={`relative rounded-3xl p-8 ${plan.isPopular
                                    ? "bg-gradient-to-b from-primary/20 to-background border-2 border-primary shadow-2xl shadow-primary/20 scale-105 z-10"
                                    : "glass border-white/10"
                                }`}
                        >
                            {plan.isPopular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-white text-sm font-bold rounded-full">
                                    Most Popular
                                </div>
                            )}

                            <h3 className="text-2xl font-bold text-foreground mb-2">{plan.name}</h3>
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-extrabold text-foreground">{plan.price}</span>
                                <span className="text-muted-foreground">{plan.period}</span>
                            </div>

                            <ul className="space-y-4 mb-8">
                                {plan.features.map((f, j) => (
                                    <li key={j} className="flex items-start gap-3 text-muted-foreground">
                                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <button className={`w-full py-4 rounded-xl font-bold transition-all duration-300 ${plan.isPopular
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                }`}>
                                Get Started
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
