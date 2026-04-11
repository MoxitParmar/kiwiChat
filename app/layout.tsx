import type { Metadata } from "next";
import "./globals.css";
import {  Geist, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner"; 


const fontSerif = Geist({
  variable: "--font-geist-serif",
  subsets: ["latin"],
});

const fontSans = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "chat.1ll.app - Agentic AI Chat",
  description: "chat.1ll.app is an agentic AI chat application built with Next.js, Convex, and Clerk. It allows you to have dynamic conversations with an AI assistant that can perform tasks on your behalf. Whether you need help with scheduling, information retrieval, or just want to chat, chat.1ll.app has got you covered.",
  icons: {
    icon: "/favicon/1ll.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSerif.variable} ${fontSans.variable} ${fontMono.variable} antialiased`}
      >
        <ClerkProvider 
        >
          <ConvexClientProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <TooltipProvider>{children}</TooltipProvider>          <Toaster />
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}