import { ingestDocumentHandler } from "../../../src/api/ingest-document.js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await ingestDocumentHandler(body);
    return Response.json(result);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
}
