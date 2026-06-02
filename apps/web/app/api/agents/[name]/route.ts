import { NextResponse } from "next/server";
import { directory } from "@/lib/server/directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One agent by name: GET /api/agents/:name */
export async function GET(_req: Request, { params }: { params: { name: string } }) {
  try {
    const agent = await directory().get(params.name);
    if (!agent) return NextResponse.json({ error: `${params.name}@asom not found` }, { status: 404 });
    return NextResponse.json(agent);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
