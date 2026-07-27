import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { projectStatusLabels, type ProjectStatus } from "@/lib/placeholder-data";

const statusClasses: Record<ProjectStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  generating: "bg-ai-soft text-ai",
  editing: "bg-primary/10 text-primary",
  complete: "bg-success/15 text-success",
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
      {projectStatusLabels[status]}
    </Badge>
  );
}
