export const CONSENT_COOKIE = "sopher_analytics_consent";
export function hasAnalyticsConsent(value: string | undefined): boolean {
  return value === "accepted";
}
export function browserHasAnalyticsConsent(): boolean {
  return (
    typeof document !== "undefined" &&
    document.cookie.split(";").some((cookie) => cookie.trim() === `${CONSENT_COOKIE}=accepted`)
  );
}
