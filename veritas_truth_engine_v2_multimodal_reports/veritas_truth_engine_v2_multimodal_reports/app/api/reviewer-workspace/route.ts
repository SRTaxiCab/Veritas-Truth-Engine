import { NextResponse } from "next/server";
import { buildDemoReviewerWorkspace } from "../../../src/api/reviewer-workspace";

export async function GET() {
  const snapshot = await buildDemoReviewerWorkspace();
  return NextResponse.json(snapshot);
}
