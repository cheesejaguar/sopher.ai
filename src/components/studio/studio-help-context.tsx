"use client";

import * as React from "react";

type StudioHelpContextValue = {
  openHelp: () => void;
  seenCoachmarks: string[] | null;
  markCoachmarkSeen: (coachmark: string) => void;
  setProjectGenre: (genre: string | null) => void;
  projectGenre: string | null;
};

const StudioHelpContext = React.createContext<StudioHelpContextValue | null>(null);

export function StudioHelpProvider({
  children,
  onOpen,
  seenCoachmarks,
  onCoachmarkSeen,
}: {
  children: React.ReactNode;
  onOpen: () => void;
  seenCoachmarks: string[] | null;
  onCoachmarkSeen: (coachmark: string) => void;
}) {
  const [projectGenre, setProjectGenre] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({
      openHelp: onOpen,
      seenCoachmarks,
      markCoachmarkSeen: onCoachmarkSeen,
      setProjectGenre,
      projectGenre,
    }),
    [onCoachmarkSeen, onOpen, projectGenre, seenCoachmarks],
  );
  return <StudioHelpContext.Provider value={value}>{children}</StudioHelpContext.Provider>;
}

export function useStudioHelp(): () => void {
  return React.useContext(StudioHelpContext)?.openHelp ?? (() => {});
}

export function useStudioHelpProjectGenre(): string | null {
  return React.useContext(StudioHelpContext)?.projectGenre ?? null;
}

export function useStudioCoachmark(coachmark: string): {
  visible: boolean;
  dismiss: () => void;
} {
  const context = React.useContext(StudioHelpContext);
  return {
    visible:
      context?.seenCoachmarks !== null &&
      context?.seenCoachmarks !== undefined &&
      !context.seenCoachmarks.includes(coachmark),
    dismiss: () => context?.markCoachmarkSeen(coachmark),
  };
}

/** Registers project-specific craft guidance with the persistent Studio shell. */
export function StudioHelpProjectGenre({ genre }: { genre: string | null }) {
  const context = React.useContext(StudioHelpContext);
  const setProjectGenre = context?.setProjectGenre;
  React.useEffect(() => {
    setProjectGenre?.(genre);
    return () => setProjectGenre?.(null);
  }, [genre, setProjectGenre]);
  return null;
}
