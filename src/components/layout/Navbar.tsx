"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Bot, Menu, X, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  const navLinks = [
    { name: "Features", href: "#features" },
    { name: "How it Works", href: "#how-it-works" },
    { name: "Pricing", href: "#pricing" },
    { name: "FAQ", href: "#faq" },
  ];

  const handleNavClick = (href: string) => {
    setIsOpen(false);
    if (pathname !== "/") {
      window.location.href = `/${href}`;
    } else {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/50 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-all">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Post Loom</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6 glass px-6 py-2 rounded-full">
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleNavClick(link.href)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Link href="/dashboard" className="text-sm font-semibold hover:text-primary transition-colors">
                    Dashboard
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="text-sm font-semibold text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-semibold hover:text-foreground transition-colors">
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="group relative inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-primary-foreground bg-primary border border-primary/20 rounded-full overflow-hidden transition-all hover:bg-primary/90 hover:scale-105 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden glass border-t border-border"
        >
          <div className="px-4 pt-2 pb-6 space-y-4">
            {navLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => handleNavClick(link.href)}
                className="block w-full text-left px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-primary/5 rounded-lg"
              >
                {link.name}
              </button>
            ))}
            <div className="pt-4 border-t border-border flex flex-col gap-3">
              {user ? (
                <Link href="/dashboard" className="w-full text-center px-4 py-3 rounded-lg bg-primary/20 text-primary font-medium">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="w-full text-center px-4 py-3 rounded-lg border border-border font-medium">
                    Log in
                  </Link>
                  <Link href="/signup" className="w-full text-center px-4 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </nav>
  );
}
