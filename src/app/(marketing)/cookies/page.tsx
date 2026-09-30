import { LegalPage } from "../legal-page";
export const metadata = { title: "Cookies" };
export default function Page() {
  return (
    <LegalPage title="Cookies" updated="September 29, 2026">
      <p>
        Sign-in, payment security, reader sessions and requested preferences use necessary storage.
        Optional analytics stay off until you accept them using the analytics preferences controls.
      </p>
      <h2>Optional measurement</h2>
      <p>
        Google Analytics, Vercel Web Analytics and product events run only after acceptance.
        sopher_aid identifies a browser and sopher_attr records first-touch attribution; both expire
        after up to 90 days. Google may set _ga cookies under its own configured retention.
      </p>
      <h2>Change your choice</h2>
      <p>
        Use Reject analytics to stop future measurement and clear site attribution cookies. The
        sopher_analytics_consent cookie remembers your choice for six months. Clearing it returns
        analytics to off. Browser settings can clear remaining site storage.
      </p>
      <p>
        For historical-data deletion, email <a href="mailto:support@sopher.ai">support@sopher.ai</a>
        . See the <a href="/privacy">privacy policy</a> for retention and provider details.
      </p>
    </LegalPage>
  );
}
