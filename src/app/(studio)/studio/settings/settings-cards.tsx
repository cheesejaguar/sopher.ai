"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { DEFAULT_TIER_KEY } from "@/components/wizard/wizard-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { QualityTier } from "@/ai/models";

const themeItems: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const tierItems: Record<QualityTier, string> = {
  draft: "Draft — fastest, cheapest",
  standard: "Standard — balanced",
  premium: "Premium — strongest models",
};

const emptySubscribe = () => () => {};

/** False during SSR and hydration, true once the client has taken over. */
function useHydrated() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function SettingRow({
  label,
  description,
  descriptionId,
  htmlFor,
  children,
}: {
  label: string;
  description: string;
  /** Lets the row's control reference the description via aria-describedby. */
  descriptionId?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-48 space-y-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  return (
    <Card className="instrument-surface rounded-sm">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Appearance
        </CardTitle>
        <CardDescription>
          The studio chrome. Manuscript pages always read like paper.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          label="Theme"
          description="Future Proof dark by default. Follows your system if you let it."
          descriptionId="theme-hint"
        >
          {mounted ? (
            <Select
              items={themeItems}
              value={theme ?? "system"}
              onValueChange={(value) => {
                if (typeof value === "string") setTheme(value);
              }}
            >
              <SelectTrigger className="w-36" aria-label="Theme" aria-describedby="theme-hint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(themeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Skeleton className="h-8 w-36" />
          )}
        </SettingRow>
      </CardContent>
    </Card>
  );
}

// Tiny external store over localStorage so the select syncs without effects.
const tierListeners = new Set<() => void>();

function subscribeTier(listener: () => void) {
  tierListeners.add(listener);
  return () => {
    tierListeners.delete(listener);
  };
}

function readStoredTier(): QualityTier {
  const stored = window.localStorage.getItem(DEFAULT_TIER_KEY);
  return stored === "draft" || stored === "premium" ? stored : "standard";
}

function writeStoredTier(tier: QualityTier) {
  window.localStorage.setItem(DEFAULT_TIER_KEY, tier);
  for (const listener of tierListeners) listener();
}

export function DefaultsCard() {
  const mounted = useHydrated();
  const tier = React.useSyncExternalStore<QualityTier>(
    subscribeTier,
    readStoredTier,
    () => "standard",
  );

  return (
    <Card className="instrument-surface rounded-sm">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Generation defaults
        </CardTitle>
        <CardDescription>
          The tier new briefs start on. Stored in this browser for now — account-level defaults
          arrive with sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          label="Quality tier"
          description="Draft for speed, Standard for most books, Premium for final prose."
          descriptionId="default-tier-hint"
        >
          {mounted ? (
            <Select
              items={tierItems}
              value={tier}
              onValueChange={(value) => {
                if (value === "draft" || value === "standard" || value === "premium") {
                  writeStoredTier(value);
                }
              }}
            >
              <SelectTrigger
                className="w-64"
                aria-label="Default quality tier"
                aria-describedby="default-tier-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(tierItems) as [QualityTier, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Skeleton className="h-8 w-64" />
          )}
        </SettingRow>
      </CardContent>
    </Card>
  );
}
