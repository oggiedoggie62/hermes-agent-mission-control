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
        <div className="flex">
          <Sidebar />
          <main className="flex-1 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
// FORCE_CLIENT_REFRESH v4
