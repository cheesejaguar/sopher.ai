import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StageNav } from "@/components/studio/stage-nav";
import { StatusBadge } from "@/components/studio/status-badge";
import { WorkspaceRail } from "@/components/studio/workspace-rail";
import { ProjectProgressProvider } from "@/components/studio/project-progress";
import { requireUser } from "@/lib/auth";
import { getChapterList, getProjectWithBook } from "@/db/queries/books";
import { getProjectProductionProgress } from "@/db/queries/project-progress";

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
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  return { title: data?.project.title ?? "Project" };
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { project, book } = data;

  const chapters = book ? await getChapterList(book.id) : [];
  const railChapters = chapters.map(({ chapterNumber, status }) => ({
    number: chapterNumber,
    status,
  }));
  const initialProgress = await getProjectProductionProgress(
    project.id,
    chapters,
    project.targetChapters,
  );

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-4 border-b border-border pb-5">
        <Link
          href="/studio"
          className="inline-flex min-h-11 items-center gap-2 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground lg:min-h-9"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Your books
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="folio-label">Active manuscript</p>
            <h1 className="mt-1 max-w-4xl text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl">
              {project.title}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {project.genre ? (
              <Badge variant="outline" className="rounded-sm capitalize">
                {project.genre}
              </Badge>
            ) : null}
            <StatusBadge status={project.status} />
          </div>
        </header>
      </div>

      <ProjectProgressProvider
        key={initialProgress.runId ?? "production-not-started"}
        projectId={project.id}
        initialProgress={initialProgress}
      >
        <StageNav projectId={project.id} />

        <div className="flex min-w-0 items-start gap-8">
          {railChapters.length > 0 ? (
            <WorkspaceRail projectId={project.id} chapters={railChapters} />
          ) : null}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </ProjectProgressProvider>
    </div>
  );
}
