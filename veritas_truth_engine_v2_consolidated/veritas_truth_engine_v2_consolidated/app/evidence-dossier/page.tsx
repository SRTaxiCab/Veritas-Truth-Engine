import { buildDossierPreview } from "../../src/api/export-dossier";

export default function EvidenceDossierPage() {
  const dossier = buildDossierPreview();

  return (
    <main style={{ fontFamily: "Arial, sans-serif", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      <h1>Evidence Dossier Studio</h1>
      <p>
        This workspace previews the provenance-first dossier output for Veritas Engine.
      </p>

      <section style={{ border: "1px solid #d3dbe5", borderRadius: 12, padding: "1rem", marginBottom: "1rem", background: "#f8fbff" }}>
        <h2>{dossier.metadata.title}</h2>
        <p><strong>Release recommendation:</strong> {dossier.releaseRecommendation}</p>
        <ul>
          {dossier.chainOfCustodyNotes.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "1rem" }}>
        <div style={{ border: "1px solid #d3dbe5", borderRadius: 12, padding: "1rem" }}>
          <h3>Claim Summary</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Claim</th>
                <th style={th}>Truth State</th>
                <th style={th}>Release</th>
              </tr>
            </thead>
            <tbody>
              {dossier.records.map((record) => (
                <tr key={record.claim.id}>
                  <td style={td}>{record.claim.claimText}</td>
                  <td style={td}>{record.assessment.truthState}</td>
                  <td style={td}>{record.assessment.releaseState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #d3dbe5", borderRadius: 12, padding: "1rem" }}>
          <h3>Provenance Paths</h3>
          {dossier.provenance.dossiers.map((section) => (
            <div key={section.claimId} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #ebeff5" }}>
              <p><strong>{section.claimText}</strong></p>
              <ol>
                {section.pathSteps.slice(0, 4).map((step) => (
                  <li key={`${section.claimId}-${step.step}`}>
                    {step.fromLabel} - {step.relation} - {step.toLabel}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #d7dfeb",
  padding: "0.5rem",
  fontSize: 13,
};

const td: React.CSSProperties = {
  verticalAlign: "top",
  borderBottom: "1px solid #edf2f7",
  padding: "0.5rem",
  fontSize: 13,
};
