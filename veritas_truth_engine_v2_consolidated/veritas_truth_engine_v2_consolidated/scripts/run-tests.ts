import assert from "node:assert/strict";
import { getIngestionHandler, listIngestionHistoryWithQuery, listJobsWithQuery } from "../src/api/ingest-document.js";
import { evaluateClaimV2 } from "../src/core/truth-engine-v2.js";
import { sampleInput } from "../src/examples/sample-input.js";
import { DocumentIngestionService } from "../src/lib/document-ingestion-service.js";
import { localVeritasStore } from "../src/lib/local-store.js";
import { buildEvidenceDossierDocument } from "../src/reports/dossier-builder.js";
import { evaluateExternalReleaseGate } from "../src/api/release-gates.js";

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
    name: "ingestion history supports text and release-state filtering",
    run: async () => {
      const service = new DocumentIngestionService();
      const releasePacket = service.ingest({
        title: "May Release Packet",
        mimeType: "text/plain",
        content: "The archive release was approved in May and operations resumed after the signed authorization was filed.",
      });
      const disputedPacket = service.ingest({
        title: "Disputed Approval Packet",
        mimeType: "text/plain",
        content:
          "The archive release was approved in May. The compliance memo stated the archive release was not approved until July.",
        publicImpact: true,
      });

      await localVeritasStore.saveIngestion(releasePacket);
      await localVeritasStore.saveIngestion(disputedPacket);

      const byText = await listIngestionHistoryWithQuery({ q: "disputed approval" });
      assert.ok(byText.ingestions.length >= 1);
      assert.equal(byText.ingestions[0]?.document.title, "Disputed Approval Packet");

      const gated = await listIngestionHistoryWithQuery({ releaseState: "review_required" });
      assert.ok(gated.ingestions.some((item) => item.document.title === "Disputed Approval Packet"));
    },
  },
  {
    name: "job history supports status filtering and ingestion lookup returns full record",
    run: async () => {
      const queued = await localVeritasStore.createJob({
        type: "document_ingestion",
        title: "Queued packet import",
        payload: { source: "test" },
      });
      await localVeritasStore.updateJob(queued.id, {
        status: "completed",
        progress: 100,
        completedAt: new Date().toISOString(),
        result: { documentId: "doc_test" },
      });

      const completed = await listJobsWithQuery({ status: "completed", q: "packet import" });
      assert.ok(completed.jobs.some((job) => job.id === queued.id));

      const history = await listIngestionHistoryWithQuery({ q: "Disputed Approval Packet", limit: 1 });
      const documentId = history.ingestions[0]?.document.id;
      assert.ok(documentId);

      const single = await getIngestionHandler(documentId!);
      assert.equal(single.ingestion.document.id, documentId);
      assert.ok(single.ingestion.claimPackages.length >= 1);
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
          product: "Veritas Engine",
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
  {
    name: "external release gate blocks hold and review-required records",
    run: () => {
      const assessment = evaluateClaimV2(sampleInput);
      const baseRecord = {
        claim: sampleInput.claim,
        assessment,
        evidence: sampleInput.evidence,
        reviewTasks: [],
      };

      const holdDecision = evaluateExternalReleaseGate([
        {
          ...baseRecord,
          assessment: { ...assessment, releaseState: "hold" },
        },
      ]);
      assert.equal(holdDecision.eligible, false);
      assert.equal(holdDecision.holdCount, 1);

      const reviewDecision = evaluateExternalReleaseGate([
        {
          ...baseRecord,
          assessment: { ...assessment, releaseState: "review_required" },
        },
      ]);
      assert.equal(reviewDecision.eligible, false);
      assert.equal(reviewDecision.reviewRequiredCount, 1);

      const autoReleaseDecision = evaluateExternalReleaseGate([
        {
          ...baseRecord,
          assessment: { ...assessment, releaseState: "auto_release" },
        },
      ]);
      assert.equal(autoReleaseDecision.eligible, true);
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
