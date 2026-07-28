"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { updateBudget } from "@/lib/actions/budget";
import { DEFAULT_TIER_KEY } from "@/components/wizard/wizard-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
  htmlFor,
  children,
}: {
  label: string;
  description: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-48 space-y-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          The studio chrome. Manuscript pages always read like paper.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          label="Theme"
          description="Midnight study by default. Follows your system if you let it."
        >
          {mounted ? (
            <Select
              items={themeItems}
              value={theme ?? "system"}
              onValueChange={(value) => {
                if (typeof value === "string") setTheme(value);
              }}
            >
              <SelectTrigger className="w-36" aria-label="Theme">
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
    <Card>
      <CardHeader>
        <CardTitle>Generation defaults</CardTitle>
        <CardDescription>
          The tier new briefs start on. Stored in this browser for now — account-level defaults
          arrive with sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          label="Quality tier"
          description="Draft for speed, Standard for most books, Premium for final prose."
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
              <SelectTrigger className="w-64" aria-label="Default quality tier">
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

export function BudgetCard({
  monthlyLimitUsd,
  spentUsd,
}: {
  monthlyLimitUsd: number;
  spentUsd: number;
}) {
  const [limit, setLimit] = React.useState(String(monthlyLimitUsd));
  const [message, setMessage] = React.useState<{ kind: "saved" | "error"; text: string } | null>(
    null,
  );
  const [pending, startTransition] = React.useTransition();

  const usedPct = monthlyLimitUsd > 0 ? Math.min((spentUsd / monthlyLimitUsd) * 100, 100) : 0;

  function handleSave() {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed < 5 || parsed > 500) {
      setMessage({ kind: "error", text: "Choose a limit between $5 and $500." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        await updateBudget({ monthlyLimitUsd: parsed });
        setMessage({ kind: "saved", text: "Budget saved." });
      } catch {
        setMessage({ kind: "error", text: "Could not save the budget. Please try again." });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly budget</CardTitle>
        <CardDescription>
          Generation pauses before a run would cross it. Never a surprise invoice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">This month</span>
            <span className="font-mono tabular-nums">
              <span className="text-ember">${spentUsd.toFixed(2)}</span>
              <span className="text-muted-foreground"> of ${monthlyLimitUsd.toFixed(2)}</span>
            </span>
          </div>
          <div
            role="meter"
            aria-label="Month-to-date spend"
            aria-valuemin={0}
            aria-valuemax={monthlyLimitUsd}
            aria-valuenow={Math.min(spentUsd, monthlyLimitUsd)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-ember transition-[width]"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        <SettingRow
          htmlFor="monthly-budget"
          label="Monthly limit"
          description="Between $5 and $500. Applies from the next generation call."
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="monthly-budget"
              type="number"
              min={5}
              max={500}
              step={1}
              inputMode="numeric"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="w-24 font-mono tabular-nums"
            />
            <Button onClick={handleSave} disabled={pending} variant="secondary">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          </div>
        </SettingRow>

        {message ? (
          <p
            role="status"
            className={
              message.kind === "error" ? "text-xs text-destructive" : "text-xs text-success"
            }
          >
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
