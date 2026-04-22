export default function ReportStudioPage() {
  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>Truth Engine Report Studio</h1>
      <p>
        This workspace packages assessed claims into standalone Veritas evidence reports with
        markdown, JSON, and HTML exports.
      </p>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Export Targets</h2>
        <ul>
          <li>Markdown for research notes and version control</li>
          <li>JSON for APIs and downstream automation</li>
          <li>HTML for browser review and future PDF rendering</li>
        </ul>
      </section>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Multimodal Evidence</h2>
        <p>
          Table evidence, figure evidence, and text evidence can be fused into a single
          structural support summary before export.
        </p>
      </section>
    </main>
  );
}
