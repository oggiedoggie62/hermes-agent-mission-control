/* agent: codex | model: gpt-5 | date: 2026-07-13 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Bot, ListTodo, Lightbulb, Calendar, FileText, Server, KanbanSquare, Archive, Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/machines", label: "Homelab", icon: Server },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/projects", label: "Projects", icon: KanbanSquare },
  { href: "/missions", label: "Missions", icon: ListTodo },
  { href: "/missions/archive", label: "Archive", icon: Archive },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/library", label: "Library", icon: FileText },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navigation = (
    <nav aria-label="Primary navigation" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setIsOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
              active
                ? "bg-[var(--panel)] text-[var(--ink)]"
                : "text-[var(--ink-2)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
            }`}
          >
            <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-2 py-1.5 font-semibold text-[15px] tracking-[-0.01em]">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--accent)] text-black" aria-hidden="true">
        O
      </span>
      <span>Hermes Mission Control</span>
    </Link>
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 backdrop-blur lg:hidden">
        {brand}
        <button
          type="button"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen((open) => !open)}
          className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-2)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--ink)]"
        >
          {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </header>

      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        id="mobile-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col gap-1 border-r border-[var(--line)] bg-[var(--bg)] p-4 transition-transform duration-200 lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 pr-10">{brand}</div>
        {navigation}
      </aside>

      <aside className="sticky top-0 hidden h-screen w-[220px] flex-none flex-col gap-1 border-r border-[var(--line)] p-4 lg:flex">
        <div className="mb-6">{brand}</div>
        {navigation}
      </aside>
    </>
  );
}
