import { sampleInput } from "../../../src/examples/sample-input";
import { getClaimGraphPayload } from "../../../src/api/graph";

export async function GET(): Promise<Response> {
  return Response.json(getClaimGraphPayload(sampleInput));
}
