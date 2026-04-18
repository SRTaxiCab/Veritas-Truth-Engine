import { ingestDocumentHandler } from "../api/ingest-document.js";

async function main() {
  const result = await ingestDocumentHandler({
    title: "ChronoScope Historical Record",
    text:
      "The archive report states the operation began in 1962. " +
      "A later witness statement denied that the operation began in 1962. " +
      "The committee report states the program was supervised by the interior ministry.",
    sourceType: "historical_record",
    origin: "ChronoScope demo"
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
