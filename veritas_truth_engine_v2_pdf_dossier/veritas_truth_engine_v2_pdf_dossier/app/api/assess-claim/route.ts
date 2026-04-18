import { NextResponse } from "next/server";
import { assessClaimHandler } from "../../../src/api/assess-claim.js";
import type { EvaluateClaimInput } from "../../../src/core/types.js";

export async function POST(req: Request) {
  const payload = (await req.json()) as EvaluateClaimInput;
  const result = await assessClaimHandler(payload);
  return NextResponse.json(result.body, { status: result.status });
}
