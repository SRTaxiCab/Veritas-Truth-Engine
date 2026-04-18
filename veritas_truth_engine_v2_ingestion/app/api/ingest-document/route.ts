import { NextRequest, NextResponse } from "next/server";
import { ingestDocumentHandler } from "../../../src/api/ingest-document";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await ingestDocumentHandler(body);
  return NextResponse.json(result);
}
