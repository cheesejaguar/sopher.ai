"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE } from "@/lib/analytics/consent";

const subscribe = () => () => {};
function choice() {
  const value = document.cookie.split(";").find((part) => part.trim().startsWith(`${CONSENT_COOKIE}=`));
  return value?.trim().split("=")[1] ?? "";
}

export function CookieChoice() {
  const current = useSyncExternalStore(subscribe, choice, () => "pending");
  function save(value: "accepted" | "rejected") {
    document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    // Reload unloads previously loaded SDKs and lets the server clear HttpOnly attribution.
    if (value === "rejected") {
      for (const item of document.cookie.split(";")) {
        const name = item.trim().split("=")[0];
        if (name === "sopher_aid" || name.startsWith("_ga")) {
          const domains = ["", location.hostname, ...location.hostname.split(".").map((_, i, parts) => parts.slice(i).join("."))];
          for (const domain of domains) {
            document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
          }
        }
      }
    }
    location.reload();
  }
  return (
    <section aria-label="Analytics preferences" className="border-t p-4 text-sm">
      <p>{current === "accepted" ? "Optional analytics are enabled." : "Optional analytics are off."} We use optional measurement to understand visits and product use. Sign-in and payments work without it. <a className="underline" href="/cookies">Cookie details</a></p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" className="rounded border px-4 py-2" onClick={() => save("accepted")}>Accept analytics</button>
        <button type="button" className="rounded border px-4 py-2" onClick={() => save("rejected")}>Reject analytics</button>
      </div>
    </section>
  );
}
