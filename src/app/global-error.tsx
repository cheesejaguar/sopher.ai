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
          fontFamily: "system-ui, sans-serif",
          background: "#0e1015",
          color: "#eceaf2",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something broke.</h1>
          <p style={{ opacity: 0.7, marginBottom: "1.25rem" }}>
            Your work is saved on our side. Try again — if this keeps happening, email
            support@sopher.ai.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #4a5fd0",
              background: "#4a5fd0",
              color: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
