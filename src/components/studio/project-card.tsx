import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/studio/status-badge";
import { RelativeTime } from "@/components/relative-time";
import { formatUsd, stageForStatus, type Project } from "@/lib/placeholder-data";

export function ProjectCard({ project }: { project: Project }) {
  const progress =
    project.chaptersTotal > 0 ? (project.chaptersDone / project.chaptersTotal) * 100 : 0;

  return (
    <Link
      href={`/projects/${project.id}/${stageForStatus(project.status)}`}
      className="group block h-full rounded-xl"
    >
      <Card className="h-full transition-shadow group-hover:ring-foreground/25">
        <CardHeader>
          <CardTitle className="font-display text-lg leading-snug font-semibold tracking-tight text-balance">
            {project.title}
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{project.genre}</Badge>
            <StatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent className="mt-auto space-y-2">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              Chapters{" "}
              <span className="font-mono tabular-nums">
                {project.chaptersDone}/{project.chaptersTotal}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {new Intl.NumberFormat("en-US").format(project.wordCount)} words
            </span>
          </div>
          <Progress value={progress} aria-label="Chapters completed" />
        </CardContent>
        <CardFooter className="justify-between text-xs">
          <span className="font-mono tabular-nums">
            {formatUsd(project.spendUsd)}{" "}
            <span className="text-muted-foreground">of ~{formatUsd(project.estimateUsd)}</span>
          </span>
          <span className="text-muted-foreground">
            Updated <RelativeTime iso={project.updatedAt} />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

export function NewBookCard() {
  return (
    <Link
      href="/studio/new"
      className="group flex h-full min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Plus aria-hidden="true" className="size-4" />
      </span>
      <span className="text-sm font-medium">Start a new book</span>
      <span className="text-xs text-muted-foreground">
        A brief in, a manuscript out. Cost quoted before anything runs.
      </span>
    </Link>
  );
}
