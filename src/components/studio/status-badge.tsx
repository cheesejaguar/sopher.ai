import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type ProjectStatus = "draft" | "generating" | "editing" | "complete" | "archived";

const statusClasses: Record<ProjectStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  generating: "bg-ai-soft text-ai",
  editing: "bg-primary/10 text-primary",
  complete: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: "Draft",
  generating: "Generating",
  editing: "In edits",
  complete: "Complete",
  archived: "Archived",
};

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(statusClasses[status], className)}>
      {status === "generating" ? (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-ai motion-safe:animate-pulse"
        />
      ) : null}
      {statusLabels[status]}
    </Badge>
  );
}
