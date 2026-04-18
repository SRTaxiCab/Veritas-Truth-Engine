import { sampleInput } from "./sample-input.js";
import { getPgPool, closePgPool } from "../lib/db.js";
import { PostgresTruthEngineRepository } from "../lib/repository.js";
import { TruthEngineService } from "../lib/service.js";

async function main() {
  const pool = getPgPool();
  const repo = new PostgresTruthEngineRepository(pool);
  const service = new TruthEngineService(repo);

  const result = await service.assessAndPersist(sampleInput);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
