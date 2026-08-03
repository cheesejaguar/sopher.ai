"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { DEFAULT_TIER_KEY } from "@/components/wizard/wizard-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { QualityTier } from "@/ai/models";
import type { NotificationPreferences } from "@/lib/notification-preferences-shared";

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

type EditableNotificationPreference = Exclude<keyof NotificationPreferences, "version">;

const notificationRows: Array<{
  key: EditableNotificationPreference;
  label: string;
  description: string;
}> = [
  {
    key: "authoringActionRequired",
    label: "My book needs me",
    description:
      "Email me when a story direction or outline needs a decision, paid writing needs credits, or production needs recovery.",
  },
  {
    key: "authoringReminders",
    label: "Follow-up reminders",
    description: "Send one reminder after an outline has waited 24 hours for my review.",
  },
  {
    key: "authoringCompleted",
    label: "My book is finished",
    description: "Email me when the completed manuscript is ready to read, edit, or export.",
  },
];

export function NotificationPreferencesCard({
  email,
  initialPreferences,
}: {
  email: string;
  initialPreferences: NotificationPreferences;
}) {
  const [saved, setSaved] = React.useState(initialPreferences);
  const [preferences, setPreferences] = React.useState(initialPreferences);
  const [unconfirmed, setUnconfirmed] = React.useState(false);
  const [status, setStatus] = React.useState<{
    kind: "idle" | "saving" | "saved" | "error";
    message: string;
  }>({ kind: "idle", message: "" });

  const dirty =
    unconfirmed || notificationRows.some((row) => preferences[row.key] !== saved[row.key]);

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const update = Object.fromEntries(
      notificationRows
        .filter((row) => unconfirmed || preferences[row.key] !== saved[row.key])
        .map((row) => [row.key, preferences[row.key]]),
    );
    if (Object.keys(update).length === 0) return;
    setStatus({ kind: "saving", message: "Saving email preferences…" });
    try {
      const response = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) throw new Error("Preference update failed");
      const payload = (await response.json()) as { preferences: NotificationPreferences };
      setSaved(payload.preferences);
      setPreferences(payload.preferences);
      setUnconfirmed(false);
      setStatus({ kind: "saved", message: "Email preferences saved." });
    } catch {
      setUnconfirmed(true);
      setStatus({
        kind: "error",
        message:
          "We couldn't confirm whether those preferences were saved. Try again, or reload to check your current account settings.",
      });
    }
  }

  return (
    <Card id="email-notifications" className="instrument-surface scroll-mt-24 rounded-sm">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Book email notifications
        </CardTitle>
        <CardDescription>
          Choose which authoring updates leave the Studio. Your in-app status and next steps are
          always available.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={savePreferences} className="space-y-5">
          <fieldset disabled={status.kind === "saving"} className="space-y-2">
            <legend className="sr-only">Optional book email notifications</legend>
            {notificationRows.map((row) => {
              const inputId = `notification-${row.key}`;
              const descriptionId = `${inputId}-description`;
              return (
                <div
                  key={row.key}
                  className="flex min-h-16 min-w-0 items-center justify-between gap-4 border-b py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={inputId}>{row.label}</Label>
                    <p
                      id={descriptionId}
                      className="max-w-2xl text-xs leading-relaxed text-muted-foreground"
                    >
                      {row.description}
                    </p>
                  </div>
                  <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-end">
                    <Switch
                      id={inputId}
                      aria-label={row.label}
                      checked={preferences[row.key]}
                      aria-describedby={descriptionId}
                      onCheckedChange={(checked) => {
                        setPreferences((current) => ({
                          ...current,
                          [row.key]: checked === true,
                        }));
                        setStatus({ kind: "idle", message: "" });
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </fieldset>

          <div className="rounded-sm border bg-muted/25 p-4 text-xs leading-relaxed text-muted-foreground">
            <p>
              Notifications go to{" "}
              <span className="break-all font-medium text-foreground">{email}</span>. Purchase
              receipts and essential account or security messages are always sent.
            </p>
            <p className="mt-2">
              These choices apply to books started after notification controls became available. A
              book already in production, or a message already being delivered, may still send its
              scheduled update.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              className="min-h-11"
              disabled={!dirty || status.kind === "saving"}
            >
              {status.kind === "saving" ? "Saving…" : "Save email preferences"}
            </Button>
            {status.message ? (
              <p
                role={status.kind === "error" ? "alert" : "status"}
                aria-live={status.kind === "error" ? "assertive" : "polite"}
                className={
                  status.kind === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {status.message}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
