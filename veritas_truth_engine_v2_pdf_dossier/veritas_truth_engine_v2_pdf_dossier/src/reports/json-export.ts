import { ReportDocument } from "./types";

export function exportReportAsJson(report: ReportDocument): string {
  return JSON.stringify(report, null, 2);
}
