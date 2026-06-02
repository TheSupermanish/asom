"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAgent, short, fmtStt, EXPLORER, type Agent } from "@/lib/api";

export default function AgentPage({ params }: { params: { name: string } }) {
  const { name } = params;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getAgent(name).then((a) => {
      setAgent(a);
      setLoading(false);
    });
  }, [name]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-fuchsia-500 hover:underline">
        ← discover
      </Link>

      {loading && <p className="mt-8 text-neutral-500">loading…</p>}
      {!loading && !agent && <p className="mt-8 text-neutral-400">{name}@tsugu not found.</p>}

      {agent && (
        <>
          <h1 className="mt-6 text-3xl font-bold">
            {agent.name}
            <span className="text-neutral-500">@tsugu</span>
          </h1>
          {agent.description && <p className="mt-2 text-neutral-400">{agent.description}</p>}

          <div className="mt-6 flex flex-wrap gap-2">
            {agent.capabilities.map((c) => (
              <span key={c} className="rounded-full bg-cyan-950 px-3 py-1 text-sm text-cyan-300">
                {c.startsWith("0x") ? short(c) : c}
              </span>
            ))}
          </div>

          <dl className="mt-8 grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
            <dt className="text-neutral-500">token</dt>
            <dd>#{agent.tokenId}</dd>
            <dt className="text-neutral-500">wallet</dt>
            <dd>
              <a className="text-cyan-400 hover:underline" href={`${EXPLORER}/address/${agent.account}`} target="_blank">
                {agent.account}
              </a>
            </dd>
            <dt className="text-neutral-500">owner</dt>
            <dd>
              <a className="text-cyan-400 hover:underline" href={`${EXPLORER}/address/${agent.owner}`} target="_blank">
                {agent.owner}
              </a>
            </dd>
            {Number(agent.pricePerCall) > 0 && (
              <>
                <dt className="text-neutral-500">price</dt>
                <dd>{fmtStt(agent.pricePerCall)} STT / call</dd>
              </>
            )}
            {agent.serviceURI && (
              <>
                <dt className="text-neutral-500">service</dt>
                <dd className="break-all text-neutral-300">{agent.serviceURI}</dd>
              </>
            )}
          </dl>
        </>
      )}
    </main>
  );
}
