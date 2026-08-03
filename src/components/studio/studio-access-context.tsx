"use client";

import * as React from "react";

export const SUSPENDED_AUTHORING_MESSAGE =
  "AI authoring and purchases are unavailable while this account is suspended. Your existing books remain available to read, edit manually, and export.";

const StudioSuspensionContext = React.createContext(false);

export function StudioSuspensionProvider({
  suspended,
  children,
}: {
  suspended: boolean;
  children: React.ReactNode;
}) {
  return (
    <StudioSuspensionContext.Provider value={suspended}>
      {children}
    </StudioSuspensionContext.Provider>
  );
}

export function useStudioSuspension(): boolean {
  return React.useContext(StudioSuspensionContext);
}
