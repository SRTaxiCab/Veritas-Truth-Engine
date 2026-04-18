import { exportDossierHandler } from "../../../src/api/export-dossier";

export async function GET() {
  const result = await exportDossierHandler();
  return Response.json(result);
}
