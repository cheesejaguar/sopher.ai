import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/types";

export type ExportHistoryStatus =
  "queued" | "running" | "awaiting_input" | "completed" | "failed" | "cancelled";

export type ExportHistoryAsset = {
  id: string;
  filename: string;
  incomplete?: boolean;
  capturedAt?: string;
};

export type ExportHistoryItem = {
  runId: string;
  format: ExportFormat | null;
  status: ExportHistoryStatus;
  error: string | null;
  asset: ExportHistoryAsset | null;
  incomplete?: boolean;
  capturedAt?: string;
  createdAt: string;
  completedAt: string | null;
  acceptanceUncertain: boolean;
  dispatchAttempts: number;
};

export type ExportHistoryResponse = {
  exports: ExportHistoryItem[];
};

export function exportFormat(value: unknown): ExportFormat | null {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value)
    ? (value as ExportFormat)
    : null;
}

export function exportIsActive(item: Pick<ExportHistoryItem, "status">): boolean {
  return item.status === "queued" || item.status === "running";
}
