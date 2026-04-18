import assert from "node:assert/strict";
import { evaluateClaimV2 } from "../src/core/truth-engine-v2.js";
import { sampleInput } from "../src/examples/sample-input.js";
import { DocumentIngestionService } from "../src/lib/document-ingestion-service.js";
import { buildEvidenceDossierDocument } from "../src/reports/dossier-builder.js";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "truth engine returns bounded probabilistic assessment",
    run: () => {
      const assessment = evaluateClaimV2(sampleInput);
      assert.equal(assessment.claimId, sampleInput.claim.id);
      assert.ok(assessment.posteriorTruthScore >= 0);
      assert.ok(assessment.posteriorTruthScore <= 1);
      assert.ok(assessment.confidenceBand >= 0);
      assert.ok(assessment.confidenceBand <= 1);
      assert.ok(["likely_true", "contested", "likely_false", "unknown"].includes(assessment.truthState));
      assert.ok(["auto_release", "review_required", "hold"].includes(assessment.releaseState));
    },
  },
  {
    name: "document ingestion extracts claims with evidence and assessments",
    run: () => {
      const service = new DocumentIngestionService();
      const result = service.ingest({
        title: "Automated Test Packet",
        mimeType: "text/plain",
        content:
          "The records office reported that the archive release was approved in May. The compliance memo stated the archive release was not approved until July.",
        publicImpact: true,
      });

      assert.equal(result.ok, true);
      assert.equal(result.document.title, "Automated Test Packet");
      assert.ok(result.document.contentHash.startsWith("sha256:"));
      assert.ok(result.chunks.length >= 1);
      assert.ok(result.claimPackages.length >= 2);
      assert.equal(result.reviewCount, result.claimPackages.length);

      for (const item of result.claimPackages) {
        assert.ok(item.claim.id.startsWith("clm_"));
        assert.ok(item.evidence.length >= 1);
        assert.equal(item.evidence[0]?.span.claimId, item.claim.id);
        assert.equal(item.assessment.claimId, item.claim.id);
      }
    },
  },
  {
    name: "ingestion accepts content aliases for external callers",
    run: () => {
      const service = new DocumentIngestionService();
      const result = service.ingest({
        title: "Alias Input Packet",
        mimeType: "text/plain",
        text: "The audit committee reported that the filing was completed on Friday.",
      });

      assert.equal(result.ok, true);
      assert.ok(result.document.contentText.includes("audit committee"));
      assert.ok(result.claimPackages.length >= 1);
    },
  },
  {
    name: "dossier builder preserves chain of custody and release recommendation",
    run: () => {
      const assessment = evaluateClaimV2(sampleInput);
      const dossier = buildEvidenceDossierDocument(
        {
          reportId: "test-dossier",
          title: "Automated Test Dossier",
          createdAt: new Date().toISOString(),
          generatedBy: "veritas-test-suite",
          product: "ChronoScope",
          classification: "Internal Analytical Use",
          subject: "Automated verification",
        },
        [
          {
            claim: sampleInput.claim,
            assessment,
            evidence: sampleInput.evidence,
            reviewTasks: [],
          },
        ]
      );

      assert.equal(dossier.metadata.reportId, "test-dossier");
      assert.equal(dossier.records.length, 1);
      assert.ok(dossier.chainOfCustodyNotes.length >= 1);
      assert.ok(dossier.releaseRecommendation.length > 0);
      assert.ok(dossier.provenance.nodes.length >= 1);
    },
  },
];

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${test.name}`);
      console.error(message);
      failures.push(`${test.name}: ${message}`);
    }
  }

  if (failures.length) {
    throw new Error(failures.join("\n"));
  }

  console.log(`All ${tests.length} tests passed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
