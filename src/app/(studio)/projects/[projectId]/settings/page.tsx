import { notFound } from "next/navigation";

import { ProjectSettingsForm } from "@/components/studio/project-settings-form";
import { requireUser } from "@/lib/auth";
import { getProjectWithBook } from "@/db/queries/books";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { userId } = await requireUser();
  const data = await getProjectWithBook(userId, projectId);
  if (!data) notFound();
  const { project } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h2 className="font-display text-xl font-semibold tracking-tight">Project settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.experience === "trial_short_story"
            ? "Voice, perspective, and content boundaries remain yours. The included story’s length and Standard quality stay fixed; a full-length setup unlocks those controls."
            : "Shape, voice, and content boundaries. Saving here never changes existing prose. A future full-book run will ask before replacing the manuscript and keep the earlier chapters in revision history."}
        </p>
      </header>
      <ProjectSettingsForm
        projectId={projectId}
        experience={project.experience}
        defaults={{
          genre: project.genre ?? "",
          targetChapters: project.targetChapters,
          targetWordsPerChapter: project.targetWordsPerChapter,
          styleGuide: project.styleGuide ?? "",
          settings: project.settings,
        }}
      />
    </div>
  );
}
