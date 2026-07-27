"use client";

import * as React from "react";
import { useTheme } from "next-themes";

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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MONTHLY_BUDGET_USD, type QualityTier } from "@/lib/placeholder-data";

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

const emptySubscribe = () => () => {};

/** False during SSR and hydration, true once the client has taken over. */
function useHydrated() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function SettingsForm() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();
  const [tier, setTier] = React.useState<QualityTier>("standard");
  const [budget, setBudget] = React.useState(String(MONTHLY_BUDGET_USD));

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Generation defaults</CardTitle>
          <CardDescription>Applied to new books. Each brief can override them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            label="Quality tier"
            description="Draft for speed, Standard for most books, Premium for final prose."
          >
            <Select
              items={tierItems}
              value={tier}
              onValueChange={(value) => {
                if (typeof value === "string") setTier(value as QualityTier);
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
          </SettingRow>
          <Separator />
          <SettingRow
            htmlFor="monthly-budget"
            label="Monthly budget"
            description="Generation pauses before a run would cross it. Never a surprise invoice."
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="monthly-budget"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className="w-24 font-mono tabular-nums"
              />
            </div>
          </SettingRow>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Preferences apply to this device for now — account sync arrives with sign-in.
      </p>
    </div>
  );
}
