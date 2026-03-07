"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { walletAddress } from "@/lib/mock-data";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Positions", href: "/" },
  { label: "History", href: "/history" },
  { label: "Scan", href: "/scan" },
  { label: "API", href: "#" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative flex items-center justify-between whitespace-nowrap border-b border-slate-800 bg-bg-dark px-6 py-3 lg:px-10">
      <div className="flex items-center gap-4">
        <Logo />
        <h2 className="text-lg font-bold leading-tight tracking-tight">
          Cross Arbitrage
        </h2>
      </div>
      <div className="flex flex-1 items-center justify-end gap-3 md:gap-6">
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={
                  isActive
                    ? "border-b-2 border-primary py-1 text-sm font-medium text-primary"
                    : "text-sm font-medium transition-colors hover:text-primary"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button className="flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90">
          {walletAddress}
        </button>
        <div className="hidden size-9 rounded-full border border-slate-700 bg-slate-700 md:block" />
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-200 transition-colors hover:border-primary/40 hover:text-white md:hidden"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span className="material-symbols-outlined text-[22px]">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="absolute inset-x-4 top-full z-50 mt-3 rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl backdrop-blur md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                      : "text-slate-200 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
