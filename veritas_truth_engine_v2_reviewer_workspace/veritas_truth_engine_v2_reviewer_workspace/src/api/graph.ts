import type { EvaluateClaimInput } from "../core/types.js";
import { buildClaimGraph } from "../graph/build-claim-graph.js";
import { buildTimeline } from "../graph/build-timeline.js";

export interface GraphApiResponse {
  graph: ReturnType<typeof buildClaimGraph>;
  timeline: ReturnType<typeof buildTimeline>;
}

export function getClaimGraphPayload(input: EvaluateClaimInput): GraphApiResponse {
  return {
    graph: buildClaimGraph(input),
    timeline: buildTimeline(input)
  };
}
