
import { adjudicateClaimV2 } from "../../../src/core/truth-engine-v2.js";
import { sampleInput } from "../../../src/examples/sample-input.js";

export default function TruthEngineDemoPage() {
  const result = adjudicateClaimV2(sampleInput);

  return (
    <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1>Veritas Truth Engine v2</h1>
      <p>ChronoScope-oriented claim adjudication demo page.</p>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Claim</h2>
        <p>{sampleInput.claim.claimText}</p>
        <p><strong>Truth state:</strong> {result.truthState}</p>
        <p><strong>Truth score:</strong> {result.truthScore.toFixed(4)}</p>
        <p><strong>Release decision:</strong> {result.releaseDecision}</p>
      </section>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2>Assessment JSON</h2>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </section>
    </main>
  );
}
