import { NextRequest, NextResponse } from "next/server";
import { exportReport } from "../../../src/api/export-report";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = exportReport(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "failed_to_export_report",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
