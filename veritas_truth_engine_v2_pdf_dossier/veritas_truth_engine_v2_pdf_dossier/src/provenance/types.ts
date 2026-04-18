export interface ProvenanceNode {
  id: string;
  type: "claim" | "evidence" | "source" | "entity" | "assessment" | "review_task";
  label: string;
  detail?: string;
  weight?: number;
}

export interface ProvenanceEdge {
  id: string;
  from: string;
  to: string;
  relation:
    | "derived_from"
    | "supported_by"
    | "contradicted_by"
    | "mentions"
    | "assessed_by"
    | "queued_for_review"
    | "same_entity_as";
  strength?: number;
}

export interface ProvenancePathStep {
  step: number;
  fromLabel: string;
  relation: string;
  toLabel: string;
  note?: string;
}

export interface ProvenanceDossierSection {
  claimId: string;
  claimText: string;
  pathSteps: ProvenancePathStep[];
  sourceTitles: string[];
  contradictionCount: number;
  reviewRequired: boolean;
}

export interface ProvenanceGraphPayload {
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
  dossiers: ProvenanceDossierSection[];
}
