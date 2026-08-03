"use client";

import * as React from "react";

import type { AuthoringNextAction } from "@/lib/authoring-journey";

type AuthoringJourneyCommandValue = {
  nextAction: AuthoringNextAction | null;
  publishNextAction: (action: AuthoringNextAction | null) => void;
};

const AuthoringJourneyCommandContext = React.createContext<AuthoringJourneyCommandValue | null>(
  null,
);

export function AuthoringJourneyCommandProvider({ children }: { children: React.ReactNode }) {
  const [nextAction, setNextAction] = React.useState<AuthoringNextAction | null>(null);
  const publishNextAction = React.useCallback((action: AuthoringNextAction | null) => {
    setNextAction((current) => {
      if (
        current?.kind === action?.kind &&
        current?.href === action?.href &&
        current?.label === action?.label &&
        current?.description === action?.description &&
        current?.requiresMeteredAccess === action?.requiresMeteredAccess
      ) {
        return current;
      }
      return action;
    });
  }, []);
  const value = React.useMemo(
    () => ({ nextAction, publishNextAction }),
    [nextAction, publishNextAction],
  );
  return (
    <AuthoringJourneyCommandContext.Provider value={value}>
      {children}
    </AuthoringJourneyCommandContext.Provider>
  );
}

export function useAuthoringJourneyCommand(): AuthoringJourneyCommandValue {
  const value = React.useContext(AuthoringJourneyCommandContext);
  if (!value) {
    throw new Error(
      "useAuthoringJourneyCommand must be used inside AuthoringJourneyCommandProvider",
    );
  }
  return value;
}

export function usePublishAuthoringNextAction(action: AuthoringNextAction): void {
  const { publishNextAction } = useAuthoringJourneyCommand();
  React.useEffect(() => {
    publishNextAction(action);
    return () => publishNextAction(null);
  }, [action, publishNextAction]);
}
