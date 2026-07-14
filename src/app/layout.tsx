/* agent: codex | model: gpt-5 | date: 2026-07-13 */
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hermes Mission Control",
  description: "Web dashboard for running and monitoring your Hermes AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-[var(--bg)] text-[var(--ink)] min-h-screen`}>
        <div className="min-h-screen lg:flex">
          <Sidebar />
          <main className="min-h-screen min-w-0 pt-16 lg:flex-1 lg:pt-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
