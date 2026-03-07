import { NextResponse } from "next/server";
import { runScan } from "@/lib/server/scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[API /scan]", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
