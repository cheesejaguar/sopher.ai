"use client";

import * as React from "react";
import { BookOpenText, Download, FileDown, FileText, FileType2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import {
  exportIsActive,
  type ExportHistoryItem,
  type ExportHistoryResponse,
} from "@/lib/export/history";
import {
  DEFAULT_PRINT_OPTIONS,
  TRIM_SIZE_IDS,
  TRIM_SIZES,
  type ExportFormat,
  type PrintOptions,
  type TrimSizeId,
} from "@/lib/export/types";
import { cn } from "@/lib/utils";

const FORMATS: {
  id: ExportFormat;
  name: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "md",
    name: "Markdown",
    blurb: "Best for editing anywhere plain text goes",
    icon: FileText,
  },
  {
    id: "docx",
    name: "Word",
    blurb: "Best for Word, Google Docs, and human editors",
    icon: FileType2,
  },
  {
    id: "epub",
    name: "EPUB proof",
    blurb: "Test in Kindle, Kobo, and Apple Books before retailer validation",
    icon: BookOpenText,
  },
  {
    id: "pdf",
    name: "Proof PDF",
    blurb: "Share a fixed proof, or set the print layout below for a press-ready interior",
    icon: FileDown,
  },
];

const TRIM_ITEMS = Object.fromEntries(
  TRIM_SIZE_IDS.map((id) => [id, `${TRIM_SIZES[id].label} — ${TRIM_SIZES[id].blurb}`] as const),
) as Record<TrimSizeId, string>;

type PrintToggle = Exclude<keyof PrintOptions, "trim">;

const PRINT_TOGGLES: { key: PrintToggle; label: string; description: string }[] = [
  {
    key: "bindingMargins",
    label: "Mirrored margins with a binding gutter",
    description:
      "Widens the margin against the spine and swaps it side to side, growing with the page count the way a bound book needs.",
  },
  {
    key: "runningHeads",
    label: "Running heads and outside page numbers",
    description:
      "Your name on left-hand pages, the title on right-hand pages, and folios at the outside edge — none of them on chapter openings.",
  },
  {
    key: "rectoChapterStarts",
    label: "Open chapters on a right-hand page",
    description:
      "Adds a blank left-hand page where a chapter would otherwise start on the back of a leaf.",
  },
];

const POLL_MS = 2_000;
const MAX_POLLS = 30;

type Phase =
  | { name: "loading" }
  | { name: "idle" }
  | {
      name: "working";
      runId: string;
      format: ExportFormat;
      incomplete?: boolean;
      capturedAt?: string;
      reattached?: boolean;
    }
  | {
      name: "done";
      runId: string;
      format: ExportFormat;
      asset: NonNullable<ExportHistoryItem["asset"]>;
      incomplete?: boolean;
      capturedAt?: string;
      restored?: boolean;
    }
  | { name: "failed"; format: ExportFormat; message: string };

function formatName(format: ExportFormat | null): string {
  return FORMATS.find((candidate) => candidate.id === format)?.name ?? "Export";
}

function historyStatus(item: ExportHistoryItem): string {
  if (item.status === "completed" && item.asset) return "Ready";
  if (exportIsActive(item)) return "Binding";
  if (item.status === "awaiting_input") return "Needs attention";
  if (item.status === "cancelled") return "Cancelled";
  if (item.status === "failed") return "Failed";
  return "Finishing";
}

function historyTime(item: ExportHistoryItem): string {
  const value = item.completedAt ?? item.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Earlier"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ExportDialog({ projectId }: { projectId: string }) {
  const [phase, setPhase] = React.useState<Phase>({ name: "loading" });
  const [history, setHistory] = React.useState<ExportHistoryItem[]>([]);
  const [historyError, setHistoryError] = React.useState("");
  const [print, setPrint] = React.useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const generation = React.useRef(0);

  const upsertHistory = React.useCallback((record: ExportHistoryItem) => {
    setHistory((current) =>
      [record, ...current.filter((item) => item.runId !== record.runId)].slice(0, 8),
    );
  }, []);

  const pollExport = React.useCallback(
    async (input: {
      ticket: number;
      runId: string;
      format: ExportFormat;
      incomplete?: boolean;
      capturedAt?: string;
      reattached?: boolean;
    }) => {
      for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        if (attempt > 0) await sleep(POLL_MS);
        if (generation.current !== input.ticket) return;

        let response: Response;
        try {
          response = await fetch(`/api/projects/${projectId}/export?runId=${input.runId}`);
        } catch {
          continue;
        }
        if (!response.ok) continue;
        const record = (await response.json()) as ExportHistoryItem;
        if (generation.current !== input.ticket) return;
        upsertHistory(record);

        const format = record.format ?? input.format;
        if (record.status === "completed" && record.asset) {
          setPhase({
            name: "done",
            runId: record.runId,
            format,
            asset: record.asset,
            incomplete: record.asset.incomplete ?? record.incomplete ?? input.incomplete,
            capturedAt: record.asset.capturedAt ?? record.capturedAt ?? input.capturedAt,
            restored: input.reattached,
          });
          toast.success(`${record.asset.filename} is ready to download`);
          return;
        }
        if (
          record.status === "failed" ||
          record.status === "cancelled" ||
          record.status === "awaiting_input"
        ) {
          setPhase({
            name: "failed",
            format,
            message:
              record.error ??
              (record.status === "awaiting_input"
                ? "This export needs attention. Try again or contact support."
                : "The export did not finish."),
          });
          return;
        }
      }

      if (generation.current !== input.ticket) return;
      setPhase({
        name: "failed",
        format: input.format,
        message:
          "This export is taking longer than expected. It is still tracked here, and this dialog will reconnect the next time you open the manuscript.",
      });
    },
    [projectId, upsertHistory],
  );

  React.useEffect(() => {
    const ticket = ++generation.current;
    const controller = new AbortController();

    async function restoreHistory() {
      setHistoryError("");
      try {
        const response = await fetch(`/api/projects/${projectId}/export`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("History unavailable");
        const payload = (await response.json()) as ExportHistoryResponse;
        if (generation.current !== ticket) return;
        const records = Array.isArray(payload.exports) ? payload.exports : [];
        setHistory(records);

        const active = records.find(
          (item): item is ExportHistoryItem & { format: ExportFormat } =>
            exportIsActive(item) && item.format !== null,
        );
        if (active) {
          setPhase({
            name: "working",
            runId: active.runId,
            format: active.format,
            incomplete: active.incomplete,
            capturedAt: active.capturedAt,
            reattached: true,
          });
          void pollExport({
            ticket,
            runId: active.runId,
            format: active.format,
            incomplete: active.incomplete,
            capturedAt: active.capturedAt,
            reattached: true,
          });
          return;
        }

        const latestReady = records.find(
          (
            item,
          ): item is ExportHistoryItem & {
            format: ExportFormat;
            asset: NonNullable<ExportHistoryItem["asset"]>;
          } => item.status === "completed" && item.format !== null && item.asset !== null,
        );
        if (latestReady) {
          setPhase({
            name: "done",
            runId: latestReady.runId,
            format: latestReady.format,
            asset: latestReady.asset,
            incomplete: latestReady.asset.incomplete ?? latestReady.incomplete,
            capturedAt: latestReady.asset.capturedAt ?? latestReady.capturedAt,
            restored: true,
          });
          return;
        }
        setPhase({ name: "idle" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (generation.current !== ticket) return;
        setHistoryError("Recent exports could not be checked. You can still start a new export.");
        setPhase({ name: "idle" });
      }
    }

    void restoreHistory();
    return () => {
      controller.abort();
      if (generation.current === ticket) generation.current += 1;
    };
  }, [pollExport, projectId]);

  async function beginExport(format: ExportFormat) {
    const ticket = ++generation.current;
    setPhase({ name: "working", runId: "pending", format });
    setHistoryError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Print layout only shapes the PDF; the other formats have no pages.
        body: JSON.stringify(format === "pdf" ? { format, print } : { format }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        runId?: string;
        format?: ExportFormat | null;
        error?: string;
        incomplete?: boolean;
        capturedAt?: string;
      };
      if (response.status === 409 && body.runId) {
        const attachedFormat = body.format ?? format;
        setPhase({
          name: "working",
          runId: body.runId,
          format: attachedFormat,
          incomplete: body.incomplete,
          capturedAt: body.capturedAt,
          reattached: true,
        });
        await pollExport({
          ticket,
          runId: body.runId,
          format: attachedFormat,
          incomplete: body.incomplete,
          capturedAt: body.capturedAt,
          reattached: true,
        });
        return;
      }
      if (!response.ok || !body.runId) {
        throw new Error(body.error ?? "The export could not be started.");
      }
      setPhase({
        name: "working",
        runId: body.runId,
        format,
        incomplete: body.incomplete,
        capturedAt: body.capturedAt,
      });
      await pollExport({
        ticket,
        runId: body.runId,
        format,
        incomplete: body.incomplete,
        capturedAt: body.capturedAt,
      });
    } catch (error) {
      if (generation.current !== ticket) return;
      setPhase({
        name: "failed",
        format,
        message: error instanceof Error ? error.message : "The export did not finish.",
      });
    }
  }

  const busy = phase.name === "loading" || phase.name === "working";
  const currentRunId = phase.name === "working" || phase.name === "done" ? phase.runId : null;
  const previousExports = history.filter((item) => item.runId !== currentRunId);
  const status =
    phase.name === "loading"
      ? "Checking recent exports."
      : phase.name === "working"
        ? phase.reattached
          ? `Reconnected to the ${formatName(phase.format)} export already in progress.`
          : `Binding the ${formatName(phase.format)} edition. This takes a few seconds.`
        : phase.name === "done"
          ? `${formatName(phase.format)} export ready to download: ${phase.asset.filename}.`
          : "";

  return (
    <Dialog>
      <Toaster />
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Download data-icon="inline-start" />
        Export
      </DialogTrigger>
      <DialogContent className="max-h-[min(92dvh,48rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export the manuscript</DialogTitle>
          <DialogDescription>
            Assembles every saved chapter into one consistent edition. Recent exports remain here
            after a reload.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Export formats">
          {FORMATS.map((format) => {
            const Icon = format.icon;
            const isActive = "format" in phase && phase.format === format.id;
            return (
              <button
                key={format.id}
                type="button"
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (!busy) void beginExport(format.id);
                }}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-1.5 rounded-sm border p-3 text-left transition-colors",
                  "hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  "aria-disabled:pointer-events-none aria-disabled:opacity-50",
                  isActive && "border-primary bg-accent",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {isActive && phase.name === "working" ? (
                    <Spinner aria-hidden="true" className="size-4" />
                  ) : (
                    <Icon className="size-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">Export as </span>
                  {format.name}
                </span>
                <span className="text-xs text-muted-foreground">{format.blurb}</span>
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby="print-layout-heading"
          className="space-y-3 border-t border-border pt-4"
        >
          <div className="space-y-1">
            <h3 id="print-layout-heading" className="text-sm font-semibold">
              PDF print layout
            </h3>
            <p id="print-layout-hint" className="text-xs text-muted-foreground">
              Shapes the Proof PDF only. Left alone, it exports the reading proof it always has;
              switched on, it prepares an interior a printer can bind.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* A Select's trigger is a button, which a <label> cannot name — the
                matching aria-label on the trigger carries it instead. */}
            <span className="text-sm leading-none font-medium">Trim size</span>
            <Select
              items={TRIM_ITEMS}
              value={print.trim}
              disabled={busy}
              onValueChange={(value) => {
                if (typeof value === "string" && value in TRIM_SIZES) {
                  setPrint((current) => ({ ...current, trim: value as TrimSizeId }));
                }
              }}
            >
              <SelectTrigger
                className="w-full sm:w-72"
                aria-label="Trim size"
                aria-describedby="print-layout-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIM_SIZE_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {TRIM_ITEMS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset disabled={busy} className="space-y-2">
            <legend className="sr-only">Print interior options</legend>
            {PRINT_TOGGLES.map((toggle) => {
              const inputId = `print-${toggle.key}`;
              const descriptionId = `${inputId}-description`;
              return (
                <div
                  key={toggle.key}
                  className="flex min-w-0 items-center justify-between gap-4 py-1"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <Label htmlFor={inputId}>{toggle.label}</Label>
                    <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">
                      {toggle.description}
                    </p>
                  </div>
                  <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-end">
                    <Switch
                      id={inputId}
                      aria-label={toggle.label}
                      aria-describedby={descriptionId}
                      checked={print[toggle.key]}
                      onCheckedChange={(checked) => {
                        setPrint((current) => ({ ...current, [toggle.key]: checked === true }));
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </fieldset>
        </section>

        <p role="status" className="sr-only">
          {status}
        </p>

        <div>
          {"incomplete" in phase && phase.incomplete ? (
            <p className="mb-3 border-y border-ember/35 py-2 text-xs text-foreground">
              This manuscript is incomplete. The export is a captured snapshot; later chapter
              changes will not alter the downloaded file.
            </p>
          ) : null}

          {phase.name === "loading" ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner aria-hidden="true" className="size-3.5" />
              Checking recent exports…
            </p>
          ) : null}

          {phase.name === "working" ? (
            <div className="space-y-1 border-y border-border py-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Spinner aria-hidden="true" className="size-4" />
                {phase.reattached ? "Reconnected to export" : "Binding the edition"}
              </p>
              <p className="text-xs text-muted-foreground">
                {phase.reattached
                  ? "This is the same saved export job; no duplicate was started."
                  : `Preparing the ${formatName(phase.format)} file…`}
              </p>
            </div>
          ) : null}

          {phase.name === "done" ? (
            <div className="space-y-2 rounded-sm border border-primary/30 bg-accent p-3">
              {phase.restored ? (
                <p className="text-xs font-medium text-primary">Latest export restored</p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-mono text-xs">{phase.asset.filename}</p>
                <a
                  href={`/api/exports/${phase.asset.id}`}
                  aria-label={`Download the ${formatName(phase.format)} export, ${phase.asset.filename}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Download aria-hidden="true" data-icon="inline-start" />
                  Download
                </a>
              </div>
            </div>
          ) : null}

          {phase.name === "failed" ? (
            <div className="space-y-2 rounded-sm bg-destructive/10 p-3">
              <p role="alert" className="text-xs text-destructive">
                {phase.message}
              </p>
              <Button variant="outline" size="xs" onClick={() => beginExport(phase.format)}>
                <RefreshCw data-icon="inline-start" />
                Check or try again
                <span className="sr-only"> — export as {formatName(phase.format)}</span>
              </Button>
            </div>
          ) : null}

          {historyError ? (
            <p role="status" className="mt-3 text-xs text-ember">
              {historyError}
            </p>
          ) : null}
        </div>

        {previousExports.length > 0 ? (
          <section aria-labelledby="recent-exports-heading" className="border-t border-border pt-4">
            <h3 id="recent-exports-heading" className="text-sm font-semibold">
              Recent exports
            </h3>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {previousExports.map((item) => (
                <li
                  key={item.runId}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {formatName(item.format)} · {historyStatus(item)}
                    </span>
                    <time
                      dateTime={item.completedAt ?? item.createdAt}
                      className="block text-xs text-muted-foreground"
                    >
                      {historyTime(item)}
                      {item.incomplete ? " · incomplete snapshot" : ""}
                    </time>
                  </span>
                  {item.asset ? (
                    <a
                      href={`/api/exports/${item.asset.id}`}
                      aria-label={`Download ${formatName(item.format)} export, ${item.asset.filename}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Download aria-hidden="true" className="size-3.5" />
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{historyStatus(item)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
