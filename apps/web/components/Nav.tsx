"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/create", label: "Create" },
  { href: "/tasks", label: "Tasks" },
  { href: "/workflows", label: "Workflows" },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injected = connectors[0];

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-fuchsia-500">
            ◆ tsugu
          </Link>
          <div className="flex gap-4 text-sm">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={active ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>

        {isConnected && address ? (
          <button
            onClick={() => disconnect()}
            className="rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-cyan-300 hover:border-fuchsia-700"
            title="Disconnect"
          >
            {short(address)}
          </button>
        ) : (
          <button
            onClick={() => injected && connect({ connector: injected })}
            disabled={!injected || isPending}
            className="rounded-lg bg-fuchsia-600 px-4 py-1.5 text-sm font-medium hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {isPending ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </nav>
    </header>
  );
}
