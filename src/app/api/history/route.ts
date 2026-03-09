import { NextRequest, NextResponse } from "next/server";
import { fetchHistory } from "@/lib/server/history-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";
    const result = await fetchHistory(forceRefresh);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /history]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
