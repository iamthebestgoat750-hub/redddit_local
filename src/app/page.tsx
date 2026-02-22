"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BlobBackground } from "@/components/ui/BlobBackground";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import UseCases from "@/components/landing/UseCases";
import Pricing from "@/components/landing/Pricing";
import FAQ from "@/components/landing/FAQ";
import CTA from "@/components/landing/CTA";

export default function LandingPage() {
  return (
    <div className="min-h-screen relative selection:bg-primary/30 bg-background text-foreground">
      <BlobBackground className="opacity-40 dark:opacity-70" />
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <UseCases />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
