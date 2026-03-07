"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { walletAddress } from "@/lib/mock-data";

const navLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Positions", href: "/" },
  { label: "History", href: "/history" },
  { label: "API", href: "#" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-800 px-6 lg:px-10 py-3 bg-bg-dark">
      <div className="flex items-center gap-4">
        <Logo />
        <h2 className="text-lg font-bold leading-tight tracking-tight">
          Cross Arbitrage
        </h2>
      </div>
      <div className="flex flex-1 justify-end gap-6 items-center">
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={
                  isActive
                    ? "text-sm font-medium text-primary border-b-2 border-primary py-1"
                    : "text-sm font-medium hover:text-primary transition-colors"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-primary text-white text-sm font-bold shadow-md hover:bg-primary/90 transition-colors">
          {walletAddress}
        </button>
        <div className="rounded-full size-9 border border-slate-700 bg-slate-700" />
      </div>
    </header>
  );
}
