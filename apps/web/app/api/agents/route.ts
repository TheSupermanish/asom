import { NextResponse, type NextRequest } from "next/server";
import { expandQuery } from "@tsugu/discover";
import { directory } from "@/lib/server/directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Search: GET /api/agents?q=summarize my pdf&capability=&limit=25 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") ?? "";
    const capability = sp.get("capability") ?? undefined;
    const limitRaw = sp.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const results = await directory().search(q, { capability, limit });
    return NextResponse.json({
      query: q,
      matchedCapabilities: expandQuery(q).canonical,
      count: results.length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
