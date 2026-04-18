import { buildReportDocument } from "../reports/report-builder";
import { exportReportAsMarkdown } from "../reports/markdown-export";
import { exportReportAsJson } from "../reports/json-export";
import { exportReportAsHtml } from "../reports/html-export";
import { ClaimReportRecord, ReportMetadata } from "../reports/types";

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
