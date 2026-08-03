import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/studio/project-menu", () => ({
  ProjectMenu: () => <button type="button">Project actions</button>,
}));

import {
  FeaturedProjectCard,
  NewBookCard,
  ProjectCard,
  type ProjectCardData,
} from "@/components/studio/project-card";

afterEach(cleanup);

const project: ProjectCardData = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "The Night Ferry",
  genre: "mystery",
  status: "draft",
  updatedAt: "2026-07-30T12:00:00.000Z",
  wordCount: 0,
  chaptersDone: 0,
  chaptersTotal: 3,
  creditsUsed: 0,
  estimateUsd: 0.6,
  statusHref: "/projects/11111111-1111-4111-8111-111111111111/write",
  nextAction: {
    kind: "start_production",
    href: "/projects/11111111-1111-4111-8111-111111111111/write",
    label: "Review production and start",
    description: "The saved brief is ready for production review.",
    requiresMeteredAccess: true,
  },
};

describe("project journey destinations", () => {
  it("routes a regular draft card to its derived action instead of the coarse status", () => {
    const { container } = render(<ProjectCard project={project} />);

    const link = screen.getByRole("link", {
      name: "Review production and start: The Night Ferry",
    });
    expect(link).toHaveAttribute("href", "/projects/11111111-1111-4111-8111-111111111111/write");
    expect(link).toHaveClass("instrument-surface");
    expect(link).not.toHaveClass("instrument-surface-raised");
    expect(container).not.toHaveTextContent("Manuscript / project");
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("uses the same derived action in the featured continuation card", () => {
    render(
      <FeaturedProjectCard
        project={{
          ...project,
          nextAction: {
            kind: "review_outline",
            href: "/projects/11111111-1111-4111-8111-111111111111/outline",
            label: "Review the outline",
            description: "Production is paused for your approval.",
            requiresMeteredAccess: false,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Review the outline: The Night Ferry" }),
    ).toHaveAttribute("href", "/projects/11111111-1111-4111-8111-111111111111/outline");
    expect(screen.getByText("Review needed")).toBeInTheDocument();
    expect(screen.getByText("Production is paused for your approval.")).toBeInTheDocument();
    expect(screen.queryByText("Continue where you left off")).not.toBeInTheDocument();
  });

  it("opens a failed book's internal status before offering email support", () => {
    render(
      <ProjectCard
        project={{
          ...project,
          statusHref: "/projects/11111111-1111-4111-8111-111111111111/write#authoring-recovery",
          nextAction: {
            kind: "contact_support",
            href: "mailto:support@sopher.ai?subject=Authoring%20help",
            label: "Contact support",
            description: "Production stopped and needs a safe evidence review.",
            requiresMeteredAccess: false,
          },
        }}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Review production status: The Night Ferry",
    });
    expect(link).toHaveAttribute(
      "href",
      "/projects/11111111-1111-4111-8111-111111111111/write#authoring-recovery",
    );
    expect(link.getAttribute("href")).not.toContain("mailto:");
    expect(screen.getByText("Review production status")).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
  });

  it("opens a failed scoped run at the editor status surface", () => {
    render(
      <ProjectCard
        project={{
          ...project,
          statusHref:
            "/projects/11111111-1111-4111-8111-111111111111/editor#editor-production-status",
          nextAction: {
            kind: "contact_support",
            href: "mailto:support@sopher.ai?subject=Authoring%20help",
            label: "Contact support",
            description: "The manuscript review needs a safe evidence check.",
            requiresMeteredAccess: false,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Review production status: The Night Ferry" }),
    ).toHaveAttribute(
      "href",
      "/projects/11111111-1111-4111-8111-111111111111/editor#editor-production-status",
    );
  });
});

describe("NewBookCard", () => {
  it("offers an optional permanent full-book unlock after completion is confirmed", () => {
    render(<NewBookCard unlockFullBooks sourceProjectId="trial-project" />);

    const link = screen.getByRole("link", { name: /take your story to full length/i });
    expect(link).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dtrial-project",
    );
    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.getByText(/one settled credit purchase permanently unlocks/i)).toBeVisible();
    expect(screen.getByText(/title, genre, and brief will carry/i)).toBeVisible();
    expect(screen.queryByText("Full-length production")).not.toBeInTheDocument();
  });

  it("keeps the ordinary new-book path for unlocked accounts", () => {
    const { container } = render(<NewBookCard />);

    expect(screen.getByRole("link", { name: /start a new book/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
    const decoration = container.querySelector<HTMLElement>('[data-slot="new-book-decoration"]');
    const copy = container.querySelector<HTMLElement>('[data-slot="new-book-copy"]');
    expect(decoration).toHaveAttribute("aria-hidden", "true");
    expect(decoration).not.toContainElement(copy);
    expect(decoration).not.toHaveClass("absolute");
    expect(screen.queryByText("New production")).not.toBeInTheDocument();
    expect(screen.queryByText(/settled credit purchase/i)).not.toBeInTheDocument();
  });

  it("does not infer an upsell merely from an unfinished trial project id", () => {
    render(<NewBookCard sourceProjectId="unfinished-trial" />);

    expect(screen.getByRole("link", { name: /start a new book/i })).toHaveAttribute(
      "href",
      "/studio/new",
    );
    expect(screen.queryByText(/take your story to full length/i)).not.toBeInTheDocument();
  });
});
