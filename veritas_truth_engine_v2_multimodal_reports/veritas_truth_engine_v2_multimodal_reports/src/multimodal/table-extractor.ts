import { TableEvidence, TableCell } from "./types";

function maybeNumeric(value: string): number | null {
  const cleaned = value.replace(/[,$%]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function tableFromMatrix(
  id: string,
  rows: string[][],
  options?: {
    title?: string;
    headers?: string[];
    pageNumber?: number | null;
    confidence?: number;
  }
): TableEvidence {
  const headers = options?.headers ?? (rows[0] ?? []).map((cell) => cell.trim());
  const bodyRows = options?.headers ? rows : rows.slice(1);

  const cells: TableCell[] = [];
  bodyRows.forEach((row, rowIdx) => {
    row.forEach((text, colIdx) => {
      cells.push({
        row: rowIdx,
        col: colIdx,
        text,
        numericValue: maybeNumeric(text),
      });
    });
  });

  return {
    id,
    title: options?.title,
    headers,
    rows: bodyRows,
    cells,
    pageNumber: options?.pageNumber ?? null,
    confidence: options?.confidence ?? 0.75,
  };
}

export function detectTableClaimSignals(table: TableEvidence): string[] {
  const notes: string[] = [];

  const numericCells = (table.cells ?? []).filter((cell) => cell.numericValue !== null);
  if (numericCells.length > 0) {
    notes.push("table_contains_numeric_observations");
  }

  if ((table.headers ?? []).some((h) => /date|year|month|day/i.test(h))) {
    notes.push("table_contains_temporal_axis");
  }

  if ((table.headers ?? []).some((h) => /source|document|archive|reference/i.test(h))) {
    notes.push("table_contains_provenance_columns");
  }

  if ((table.rows ?? []).length > 10) {
    notes.push("table_has_broad_row_coverage");
  }

  return notes;
}
