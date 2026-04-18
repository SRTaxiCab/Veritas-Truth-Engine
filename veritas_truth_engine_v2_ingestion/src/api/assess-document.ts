import { DocumentAssessmentService } from "../lib/document-assessment-service";

export async function assessDocumentPathHandler(payload: { filePath: string; title?: string }) {
  const service = new DocumentAssessmentService();
  return service.assessDocumentPath(payload.filePath, payload.title);
}
