"use client";

import React, { useMemo } from "react";

type Node = {
  id: string;
  kind: "claim" | "entity" | "source";
  label: string;
  group: string;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
};

const sampleNodes: Node[] = [
  { id: "clm_hist_001", kind: "claim", label: "Committee Alpha revised its public account after the memo circulated.", group: "asserted_fact" },
  { id: "ent_1", kind: "entity", label: "Committee Alpha", group: "organization" },
  { id: "src_arch_1", kind: "source", label: "Committee Internal Records", group: "government_record" },
  { id: "src_pr_1", kind: "source", label: "Committee Press Office Statement", group: "article" }
];

const sampleEdges: Edge[] = [
  { id: "e1", source: "clm_hist_001", target: "ent_1", type: "mentions", weight: 1 },
  { id: "e2", source: "clm_hist_001", target: "src_arch_1", type: "supported_by", weight: 0.91 },
  { id: "e3", source: "clm_hist_001", target: "src_pr_1", type: "contradicted_by", weight: 0.58 }
];

function nodeColor(kind: Node["kind"]): string {
  if (kind === "claim") return "#1d4ed8";
  if (kind === "entity") return "#0f766e";
  return "#7c3aed";
}

export default function TruthEngineGraphPage(): JSX.Element {
  const layout = useMemo(() => {
    const width = 980;
    const height = 520;
    return sampleNodes.map((node, index) => ({
      ...node,
      x: 140 + (index % 3) * 320,
      y: 110 + Math.floor(index / 3) * 200,
      color: nodeColor(node.kind)
    }));
  }, []);

  const nodeById = Object.fromEntries(layout.map((n) => [n.id, n]));

  return (
    <main style={{ padding: 24, fontFamily: "Inter, Arial, sans-serif", background: "#07111f", minHeight: "100vh", color: "#e5eefc" }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>Truth Engine Graph View</h1>
      <p style={{ maxWidth: 920, color: "#b4c4df" }}>
        This demo page shows the contradiction graph layer for ChronoScope-style historical adjudication.
        Claims, entities, and sources are rendered as distinct node classes so provenance and contradiction structure are visible at a glance.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 20 }}>
        <section style={{ background: "#0b1729", border: "1px solid #1d2a40", borderRadius: 18, padding: 16 }}>
          <svg viewBox="0 0 980 520" width="100%" height="520" role="img" aria-label="Truth graph">
            {sampleEdges.map((edge) => {
              const s = nodeById[edge.source];
              const t = nodeById[edge.target];
              if (!s || !t) return null;
              return (
                <g key={edge.id}>
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={edge.type === "contradicted_by" ? "#ef4444" : "#60a5fa"} strokeWidth={2 + edge.weight} opacity={0.8} />
                  <text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 8} fill="#d7e6ff" fontSize="12" textAnchor="middle">
                    {edge.type}
                  </text>
                </g>
              );
            })}
            {layout.map((node) => (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r={42} fill={node.color} opacity={0.92} />
                <text x={node.x} y={node.y - 4} textAnchor="middle" fill="white" fontSize="12" fontWeight={700}>
                  {node.kind.toUpperCase()}
                </text>
                <text x={node.x} y={node.y + 14} textAnchor="middle" fill="white" fontSize="11">
                  {node.label.slice(0, 24)}
                </text>
              </g>
            ))}
          </svg>
        </section>

        <aside style={{ background: "#0b1729", border: "1px solid #1d2a40", borderRadius: 18, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Legend</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div><strong>Claims</strong><div style={{ color: "#b4c4df" }}>Atomic propositions under adjudication.</div></div>
            <div><strong>Entities</strong><div style={{ color: "#b4c4df" }}>Resolved people, organizations, places, or documents.</div></div>
            <div><strong>Sources</strong><div style={{ color: "#b4c4df" }}>Documents or records linked through evidence spans.</div></div>
            <div><strong>Blue edges</strong><div style={{ color: "#b4c4df" }}>Support or provenance links.</div></div>
            <div><strong>Red edges</strong><div style={{ color: "#b4c4df" }}>Contradiction links.</div></div>
          </div>
        </aside>
      </div>
    </main>
  );
}
