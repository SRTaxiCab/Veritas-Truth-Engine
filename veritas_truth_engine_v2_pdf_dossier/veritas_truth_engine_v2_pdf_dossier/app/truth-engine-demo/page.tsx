export default function TruthEngineDemoPage() {
  return (
    <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <h1>Veritas Truth Engine v2 Demo</h1>
      <p>
        POST a claim package to <code>/api/assess-claim</code>. When <code>DATABASE_URL</code> is configured,
        the assessment is persisted into PostgreSQL and non-auto-release claims are routed into the review queue.
      </p>
      <ul>
        <li>Posterior truth score</li>
        <li>Truth state</li>
        <li>Release state</li>
        <li>Feature vector</li>
        <li>Explanation trace</li>
      </ul>
    </main>
  );
}
