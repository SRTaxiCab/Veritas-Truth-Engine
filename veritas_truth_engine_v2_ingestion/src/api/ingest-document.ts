import { DocumentAssessmentService } from "../lib/document-assessment-service";

export async function ingestDocumentHandler(payload: { title: string; content: string; mimeType?: "text/plain" | "text/markdown" | "application/json" | "application/pdf" }) {
  const service = new DocumentAssessmentService();
  return service.assessTextDocument(payload.title, payload.content, payload.mimeType ?? "text/plain");
}
