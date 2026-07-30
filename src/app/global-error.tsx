"use client";

/**
 * Last-resort error boundary — replaces the entire document, so it must render
 * its own html/body and cannot rely on the app's styles being present.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, system-ui, sans-serif",
          background: "#080910",
          color: "#f2f1f6",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "42rem",
            border: "1px solid #30313d",
            background: "#11121a",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1rem 1.25rem",
              borderBottom: "1px solid #30313d",
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            <span>sopher.ai</span>
            <span style={{ color: "#a9a8b4" }}>Recovery / 01</span>
          </div>
          <div style={{ padding: "3rem 1.25rem" }}>
            <div
              style={{
                width: "3rem",
                height: "2px",
                marginBottom: "1.5rem",
                background: "#7357e8",
              }}
            />
            <h1
              style={{
                maxWidth: "30rem",
                fontSize: "clamp(2rem, 8vw, 3.75rem)",
                lineHeight: 0.98,
                letterSpacing: "-0.035em",
                margin: 0,
              }}
            >
              The instrument lost its place.
            </h1>
            <p
              style={{
                maxWidth: "34rem",
                color: "#b4b3be",
                lineHeight: 1.65,
                margin: "1.5rem 0 2rem",
              }}
            >
              Your saved work is unaffected. Try the page again. If the problem continues, email
              support@sopher.ai.
            </p>
            <button
              onClick={reset}
              style={{
                minHeight: "44px",
                padding: "0.65rem 1.25rem",
                borderRadius: "4px",
                border: "1px solid #7357e8",
                background: "#5a3fd0",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Resume
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
