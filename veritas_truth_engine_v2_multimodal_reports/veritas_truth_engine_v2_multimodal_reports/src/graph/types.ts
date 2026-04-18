export interface GraphNode {
  id: string;
  kind: "claim" | "entity" | "source";
  label: string;
  group: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type:
    | "mentions"
    | "supported_by"
    | "contradicted_by"
    | "derived_from"
    | "supports"
    | "contradicts"
    | "temporal_order";
  weight: number;
  metadata?: Record<string, unknown>;
}

export interface ClaimGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  label: string;
  group: string;
  metadata?: Record<string, unknown>;
}
