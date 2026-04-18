import { NextRequest, NextResponse } from "next/server";
import { assessDocumentPathHandler } from "../../../src/api/assess-document";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await assessDocumentPathHandler(body);
  return NextResponse.json(result);
}
