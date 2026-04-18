import { evaluateClaimV2 } from "../core/truth-engine-v2.js";
import { EvaluateClaimInput } from "../core/types.js";

export async function assessClaimHandler(payload: EvaluateClaimInput) {
  const assessment = evaluateClaimV2(payload);

  return {
    status: 200,
    body: {
      ok: true,
      assessment,
    },
  };
}
