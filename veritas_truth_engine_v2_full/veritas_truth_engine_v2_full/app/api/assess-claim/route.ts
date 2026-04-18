
// Next.js App Router example
import { NextResponse } from "next/server";
import { adjudicateClaimV2 } from "../../../../src/core/truth-engine-v2.js";
import { sampleInput } from "../../../../src/examples/sample-input.js";

export async function GET() {
  const result = adjudicateClaimV2(sampleInput);
  return NextResponse.json(result);
}
