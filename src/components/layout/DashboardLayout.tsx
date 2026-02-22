import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, LineChart, MessageSquare,
  Settings, LogOut, Bot, ChevronRight, Menu, X, Flame
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  const navItems = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "Accounts", href: "/dashboard/accounts", icon: Users },
    { name: "Warmup", href: "/dashboard/warmup", icon: Flame },
    { name: "Analytics", href: "/dashboard/analytics", icon: LineChart },
    { name: "Auto Reply", href: "/dashboard/auto-reply", icon: MessageSquare },
  ];

  const SidebarContent = () => (
    <>
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">Post Loom</span>
      </div>

      <div className="px-4 py-2">
        <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Menu
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive
                  ? "bg-primary/10 text-primary font-medium border border-primary/20"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  }`}
                onClick={() => setIsMobileOpen(false)}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                {item.name}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-border">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-all mb-2"
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>

        <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium shrink-0">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-foreground truncate">{user?.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 z-50 border-r border-border bg-card/50 backdrop-blur-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-background/80 backdrop-blur-xl z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" />
          <span className="font-bold">Post Loom</span>
        </div>
        <button onClick={() => setIsMobileOpen(true)} className="p-2">
          <Menu className="w-6 h-6 text-foreground" />
        </button>
      </div>

      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-3/4 max-w-sm bg-background border-r border-white/10 z-50 flex flex-col"
            >
              <button
                onClick={() => setIsMobileOpen(false)}
                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-white bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 flex flex-col min-h-screen pt-16 lg:pt-0 relative overflow-hidden">
        {/* Subtle background glow for dashboard */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full mix-blend-screen filter blur-[120px] pointer-events-none" />

        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full z-10">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
