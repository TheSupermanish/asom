import { NextResponse } from "next/server";
import { directory, chainId } from "@/lib/server/directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + how many advertised agents are indexed. */
export async function GET() {
  try {
    const agents = await directory().agents();
    return NextResponse.json({ ok: true, chainId: chainId(), agents: agents.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
