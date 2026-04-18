import { MultimodalEvidencePacket, FusedEvidenceSummary } from "./types";
import { detectTableClaimSignals } from "./table-extractor";
import { detectImageClaimSignals } from "./image-evidence";

export function fuseMultimodalEvidence(packet: MultimodalEvidencePacket): FusedEvidenceSummary {
  const modalityCoverage = new Set<typeof packet.modality | "text" | "table" | "image" | "timeline" | "mixed">();
  modalityCoverage.add(packet.modality);

  const notes: string[] = [];
  let support = 0.10;
  let contradiction = 0.0;

  if (packet.tableEvidence && packet.tableEvidence.length > 0) {
    modalityCoverage.add("table");
    support += 0.25;
    for (const table of packet.tableEvidence) {
      notes.push(...detectTableClaimSignals(table));
      if ((table.confidence ?? 0) < 0.5) contradiction += 0.05;
    }
  }

  if (packet.imageEvidence && packet.imageEvidence.length > 0) {
    modalityCoverage.add("image");
    support += 0.15;
    notes.push(...detectImageClaimSignals(packet.imageEvidence));
    if (packet.imageEvidence.some((i) => (i.confidence ?? 0) < 0.5)) contradiction += 0.05;
  }

  if (packet.modality === "mixed") {
    support += 0.10;
    notes.push("claim_is_supported_by_multiple_modalities");
  }

  if ((packet.notes ?? []).length > 0) {
    notes.push(...(packet.notes ?? []));
  }

  return {
    claimId: packet.claimId,
    modalityCoverage: [...modalityCoverage],
    structuralSupportScore: Math.max(0, Math.min(1, support)),
    structuralContradictionScore: Math.max(0, Math.min(1, contradiction)),
    notes: [...new Set(notes)],
  };
}
