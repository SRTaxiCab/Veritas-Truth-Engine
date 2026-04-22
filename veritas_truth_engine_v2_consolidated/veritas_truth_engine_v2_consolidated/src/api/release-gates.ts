import type { ClaimReportRecord } from "../reports/types.js";

export type ReleaseGateDecision = {
  eligible: boolean;
  holdCount: number;
  reviewRequiredCount: number;
  openReviewTaskCount: number;
  reason: string;
};

export function evaluateExternalReleaseGate(records: ClaimReportRecord[]): ReleaseGateDecision {
  const holdCount = records.filter((record) => record.assessment.releaseState === "hold").length;
  const reviewRequiredCount = records.filter((record) => record.assessment.releaseState === "review_required").length;
  const openReviewTaskCount = records.reduce(
    (count, record) => count + (record.reviewTasks ?? []).filter((task) => task.status === "open").length,
    0
  );

  if (holdCount > 0) {
    return {
      eligible: false,
      holdCount,
      reviewRequiredCount,
      openReviewTaskCount,
      reason: `${holdCount} claim(s) remain on hold.`,
    };
  }

  if (reviewRequiredCount > 0 || openReviewTaskCount > 0) {
    return {
      eligible: false,
      holdCount,
      reviewRequiredCount,
      openReviewTaskCount,
      reason: `${Math.max(reviewRequiredCount, openReviewTaskCount)} claim(s) still require reviewer validation.`,
    };
  }

  return {
    eligible: true,
    holdCount,
    reviewRequiredCount,
    openReviewTaskCount,
    reason: "All assessed claims are eligible for controlled external release.",
  };
}

