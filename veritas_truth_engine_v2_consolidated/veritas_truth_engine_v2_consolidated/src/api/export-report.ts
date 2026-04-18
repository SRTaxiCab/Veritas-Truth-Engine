import { buildReportDocument } from "../reports/report-builder.js";
import { exportReportAsMarkdown } from "../reports/markdown-export.js";
import { exportReportAsJson } from "../reports/json-export.js";
import { exportReportAsHtml } from "../reports/html-export.js";
import { ClaimReportRecord, ReportMetadata } from "../reports/types.js";
import { getEnterpriseRepository } from "../lib/enterprise-repository-factory.js";
import { sampleClaimReportRecords } from "../examples/sample-report-records.js";

export interface ExportReportRequest {
  metadata: ReportMetadata;
  records: ClaimReportRecord[];
  format: "markdown" | "json" | "html";
}

export interface ExportReportResponse {
  metadata: ReportMetadata;
  format: "markdown" | "json" | "html";
  content: string;
}

export function exportReport(request: ExportReportRequest): ExportReportResponse {
  const report = buildReportDocument(request.metadata, request.records);

  const content =
    request.format === "json"
      ? exportReportAsJson(report)
      : request.format === "html"
      ? exportReportAsHtml(report)
      : exportReportAsMarkdown(report);

  return {
    metadata: report.metadata,
    format: request.format,
    content,
  };
}

export async function exportLiveReport(format: "markdown" | "json" | "html" = "markdown"): Promise<ExportReportResponse> {
  const repo = getEnterpriseRepository();
  const records = await repo.latestReportRecords();
  const activeRecords = records.length ? records : sampleClaimReportRecords;
  const response = exportReport({
    format,
    metadata: {
      reportId: `report-${Date.now()}`,
      title: records.length ? "Veritas Live Claim Assessment Report" : "Veritas Demo Claim Assessment Report",
      createdAt: new Date().toISOString(),
      generatedBy: "veritas_truth_engine_v2_consolidated",
      product: "ChronoScope",
      classification: "Internal Analytical Use",
      subject: records.length
        ? `${records.length} claim(s) from local ingestion workspace`
        : "Seeded demonstration records",
    },
    records: activeRecords,
  });
  await repo.audit("report.export", "report", response.metadata.reportId, `Exported ${format} report.`, {
    format,
    records: activeRecords.length,
  });
  return response;
}
