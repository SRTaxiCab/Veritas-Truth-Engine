import { DocumentAssessmentService } from "../lib/document-assessment-service";

async function main() {
  const service = new DocumentAssessmentService();
  const result = await service.assessTextDocument(
    "ChronoScope Historical Memo",
    `In 1963 the committee stated that the archive was sealed. Later testimony reported that the archive was not fully sealed and that multiple officials accessed it in 1964. The revised memorandum stated the archive was sealed for public access only.`
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
