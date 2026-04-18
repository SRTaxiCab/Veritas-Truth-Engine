import { evaluateClaimV2 } from "../core/truth-engine-v2.js";
import type { EvaluateClaimInput } from "../core/types.js";
import { getPgPool } from "../lib/db.js";
import { PostgresTruthEngineRepository } from "../lib/repository.js";
import { TruthEngineService } from "../lib/service.js";

export async function assessClaimHandler(payload: EvaluateClaimInput) {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    const assessment = evaluateClaimV2(payload);
    return {
      status: 200,
      body: {
        ok: true,
        persisted: false,
        assessment,
      },
    };
  }

  const pool = getPgPool(connectionString);
  const repo = new PostgresTruthEngineRepository(pool);
  const service = new TruthEngineService(repo);
  const assessment = await service.assessAndPersist(payload);

  return {
    status: 200,
    body: {
      ok: true,
      persisted: true,
      assessment,
    },
  };
}
