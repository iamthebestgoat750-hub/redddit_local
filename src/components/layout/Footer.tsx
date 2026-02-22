import Link from "next/link";
import { Bot, Twitter, Github, Disc } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-background relative overflow-hidden">
      {/* subtle glow at bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-24 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 lg:gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">Post Loom</span>
            </Link>
            <p className="text-muted-foreground max-w-sm mb-6">
              Automate your Reddit presence, build authentic karma, and scale your SaaS marketing on autopilot with intelligent warming algorithms.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                <Disc className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-3">
              <li><a href="#features" className="text-muted-foreground hover:text-primary transition-colors">Features</a></li>
              <li><a href="#pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</a></li>
              <li><a href="#use-cases" className="text-muted-foreground hover:text-primary transition-colors">Use Cases</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-primary transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Post Loom Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
