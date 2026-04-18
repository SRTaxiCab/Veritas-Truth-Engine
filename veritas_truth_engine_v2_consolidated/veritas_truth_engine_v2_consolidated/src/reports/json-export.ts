import { ReportDocument } from "./types.js";

export function exportReportAsJson(report: ReportDocument): string {
  return JSON.stringify(report, null, 2);
}
