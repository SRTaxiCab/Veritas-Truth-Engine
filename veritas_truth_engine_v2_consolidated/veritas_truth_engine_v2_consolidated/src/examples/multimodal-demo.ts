import { tableFromMatrix } from "../multimodal/table-extractor.js";
import { buildImageEvidence } from "../multimodal/image-evidence.js";
import { fuseMultimodalEvidence } from "../multimodal/evidence-fusion.js";

const table = tableFromMatrix(
  "tbl_001",
  [
    ["Year", "Archive Count", "Confirmed References"],
    ["1947", "12", "7"],
    ["1948", "18", "11"],
  ],
  { title: "Archive continuity table", pageNumber: 3, confidence: 0.84 }
);

const image = buildImageEvidence("img_001", "timeline chart", {
  caption: "Reconstructed event chronology from archive packet.",
  pageNumber: 4,
  confidence: 0.79,
});

const fused = fuseMultimodalEvidence({
  claimId: "clm_multimodal_001",
  modality: "mixed",
  summary: "Claim supported by table counts and timeline figure.",
  tableEvidence: [table],
  imageEvidence: [image],
  notes: ["historical_summary_figure_present"],
});

console.log(JSON.stringify(fused, null, 2));
