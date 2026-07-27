import type { Metadata } from "next";

import { SettingsForm } from "@/components/studio/settings-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          How the studio looks and what new books assume.
        </p>
      </header>
      <SettingsForm />
    </div>
  );
}
