export const AUTHORING_ONBOARDING_VERSION = 1;

export const AUTHORING_CHECKLIST_STEP_IDS = [
  "shape_idea",
  "start_production",
  "review_outline",
  "watch_chapters",
  "edit_manuscript",
  "read_or_export",
  "continue_full_length",
] as const;

export type AuthoringChecklistStepId = (typeof AUTHORING_CHECKLIST_STEP_IDS)[number];

export type AuthoringChecklistStep = {
  id: AuthoringChecklistStepId;
  label: string;
  description: string;
  complete: boolean;
  href: string;
};

export type AuthoringOnboardingSnapshot = {
  version: number;
  dismissed: boolean;
  seenCoachmarks: string[];
  completedCount: number;
  steps: AuthoringChecklistStep[];
};

export type AuthoringOnboardingPreferences = {
  version: number;
  dismissed: boolean;
  seenCoachmarks: string[];
};

export type AuthoringOnboardingUpdate =
  | { action: "dismiss_checklist"; dismissed: boolean }
  | { action: "mark_coachmark_seen"; coachmark: string };
