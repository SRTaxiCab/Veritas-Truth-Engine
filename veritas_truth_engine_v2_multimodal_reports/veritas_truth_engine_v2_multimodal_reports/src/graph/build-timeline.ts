import type { EvaluateClaimInput } from "../core/types.js";
import type { TimelineEvent } from "./types.js";

export function buildTimeline(input: EvaluateClaimInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (input.claim.timeStart) {
    events.push({
      id: `${input.claim.id}_start`,
      timestamp: input.claim.timeStart,
      label: `Claim window opens: ${input.claim.claimText}`,
      group: "claim",
      metadata: { claimId: input.claim.id }
    });
  }

  if (input.claim.timeEnd) {
    events.push({
      id: `${input.claim.id}_end`,
      timestamp: input.claim.timeEnd,
      label: `Claim window closes: ${input.claim.claimText}`,
      group: "claim",
      metadata: { claimId: input.claim.id }
    });
  }

  for (const bundle of input.evidence) {
    if (bundle.source.publishedAt) {
      events.push({
        id: `${bundle.span.id}_published`,
        timestamp: bundle.source.publishedAt,
        label: `${bundle.source.title} (${bundle.span.evidenceRole})`,
        group: bundle.span.evidenceRole,
        metadata: {
          sourceId: bundle.source.id,
          pageNumber: bundle.span.pageNumber ?? null
        }
      });
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
