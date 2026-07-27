import type { Metadata } from "next";

import { EmptyLibrary } from "@/components/studio/empty-library";
import { NewBookCard, ProjectCard } from "@/components/studio/project-card";
import { sampleProjects } from "@/lib/placeholder-data";

export const metadata: Metadata = {
  title: "Your books",
};

export default function StudioPage() {
  const projects = sampleProjects;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your books</h1>
        <p className="text-sm text-muted-foreground">
          Every manuscript starts as a brief. Pick up where you left off.
        </p>
      </header>

      {projects.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <NewBookCard />
        </div>
      )}
    </div>
  );
}
