import { ImageResponse } from "next/og";

import { OgBrand } from "@/components/og-brand";
import { PIPELINE_STEPS } from "@/components/marketing/content";

export const alt = "sopher.ai — The book in your head, finally on the page.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  // ImageResponse/Satori has no access to the page's CSS custom properties.
  // Keep this server-rendered asset palette synchronized with DESIGN.md.
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: "#09090d",
        color: "#f4f2f8",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 22,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        <OgBrand />
        <div style={{ display: "flex", color: "#8f8b99", fontSize: 14 }}>Future proof / 01–05</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 770,
            fontSize: 74,
            fontWeight: 700,
            lineHeight: 0.96,
            letterSpacing: "-0.04em",
          }}
        >
          <span style={{ display: "flex" }}>The book in your head,</span>
          <span style={{ display: "flex" }}>finally on the page.</span>
        </div>
        <div
          style={{
            display: "flex",
            width: 180,
            height: 142,
            padding: 18,
            backgroundColor: "#fffdf7",
            backgroundImage:
              "repeating-linear-gradient(180deg, transparent 0, transparent 21px, rgba(63,112,148,.15) 21px, rgba(63,112,148,.15) 22px)",
            border: "1px solid #d9d2c7",
            boxShadow: "8px 8px 0 #e1dbd1, 16px 16px 0 #cfc8bf",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "100%",
              borderRight: "1px solid #ddd6cc",
            }}
          />
          <div style={{ display: "flex", width: "100%" }} />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          width: "100%",
          borderTop: "1px solid rgba(255,255,255,.14)",
        }}
      >
        {PIPELINE_STEPS.map((stage, index) => (
          <div
            key={stage.name}
            style={{
              display: "flex",
              flex: 1,
              paddingTop: 18,
              color: index === 2 ? "#6eddf2" : "#96919f",
              fontSize: 15,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {String(index + 1).padStart(2, "0")} / {stage.name}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
