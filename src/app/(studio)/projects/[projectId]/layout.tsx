import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { StageNav } from "@/components/studio/stage-nav";
import { StatusBadge } from "@/components/studio/status-badge";
import { WorkspaceRail } from "@/components/studio/workspace-rail";
import { getProject, sampleChapters } from "@/lib/placeholder-data";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return { title: getProject(projectId)?.title ?? "Project" };
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();

  const railChapters = sampleChapters.map(({ number, status }) => ({ number, status }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
          {project.title}
        </h1>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{project.genre}</Badge>
          <StatusBadge status={project.status} />
        </div>
      </header>

      <StageNav projectId={project.id} />

      <div className="flex items-start gap-8">
        <aside aria-label="Chapter overview" className="hidden shrink-0 lg:block">
          <WorkspaceRail projectId={project.id} chapters={railChapters} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
