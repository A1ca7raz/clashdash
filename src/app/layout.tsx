import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { OverrideLockedNotice } from "@/components/override-locked";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isOverrideLocked } from "@/server/override-lock";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClashDash",
  description: "mihomo 配置管理平台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locked = await isOverrideLocked();
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TooltipProvider>{locked ? <OverrideLockedNotice /> : children}</TooltipProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
