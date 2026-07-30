"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

const PRIVATE_PATH_PREFIXES = ["/studio", "/projects", "/admin", "/sign-in", "/sign-up", "/api"];

function publicVercelEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url, window.location.origin);
  if (PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
  return { ...event, url: `${url.origin}${url.pathname}` };
}

/**
 * Analytics lives inside the marketing route group, never the authenticated
 * product. GA pageviews are explicit so a project title or private URL cannot
 * leak through automatic history tracking.
 */
export function PublicAnalytics({
  gaId,
  vercelEnabled,
}: {
  gaId?: string;
  vercelEnabled: boolean;
}) {
  const pathname = usePathname();
  const configured = useRef(false);

  useEffect(() => {
    if (!gaId) return;
    const analyticsWindow = window as AnalyticsWindow;
    const disableKey = `ga-disable-${gaId}`;
    const flags = window as unknown as Record<string, unknown>;
    flags[disableKey] = false;
    analyticsWindow.dataLayer ??= [];
    analyticsWindow.gtag ??= (...args: unknown[]) => {
      analyticsWindow.dataLayer?.push(args);
    };

    if (!configured.current) {
      analyticsWindow.gtag("js", new Date());
      analyticsWindow.gtag("config", gaId, { send_page_view: false });
      configured.current = true;
    }

    return () => {
      // gtag.js persists after a Next layout unmount. Disable the property
      // before any private route can paint, even if browser-history enhanced
      // measurement is enabled in GA.
      flags[disableKey] = true;
    };
  }, [gaId]);

  useEffect(() => {
    if (!gaId) return;
    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_title: document.title,
    });
  }, [gaId, pathname]);

  return (
    <>
      {vercelEnabled ? <Analytics beforeSend={publicVercelEvent} /> : null}
      {gaId ? (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
