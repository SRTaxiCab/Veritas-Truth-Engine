import { sampleInput } from "./sample-input.js";
import { getClaimGraphPayload } from "../api/graph.js";

const payload = getClaimGraphPayload(sampleInput);

console.log("Graph nodes:", payload.graph.nodes.length);
console.log("Graph edges:", payload.graph.edges.length);
console.log("Timeline events:", payload.timeline.length);
console.log(JSON.stringify(payload, null, 2));
