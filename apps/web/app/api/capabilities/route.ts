import { NextResponse } from "next/server";
import { CANONICAL_TAGS } from "@asom/discover";

export const runtime = "nodejs";

/** The canonical capability vocabulary (for UI hints / autocomplete). */
export async function GET() {
  return NextResponse.json({ canonical: CANONICAL_TAGS });
}
