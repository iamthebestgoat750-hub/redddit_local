import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PostLoom — AI Reddit Marketing on Autopilot",
  description:
    "Get customers on autopilot from Reddit. AI-powered account warmup, smart subreddit discovery, auto-replies, and multi-subreddit publishing.",
  keywords: [
    "Reddit marketing",
    "AI marketing",
    "Reddit automation",
    "subreddit discovery",
    "Reddit posts",
    "SaaS marketing",
  ],
  openGraph: {
    title: "PostLoom — AI Reddit Marketing on Autopilot",
    description:
      "Get customers on autopilot from Reddit. Smart discovery, auto-replies & multi-posting.",
    type: "website",
    url: "https://postloom.com",
  },
};

import { AuthProvider } from "@/components/providers/SessionProvider";
import { Toaster } from "sonner"; // Provides toast notifications

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${outfit.variable} antialiased`}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" theme="light" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
