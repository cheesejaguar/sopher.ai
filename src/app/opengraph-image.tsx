import { ImageResponse } from "next/og";

import { OgBrand } from "@/components/og-brand";
import { PIPELINE_STEPS } from "@/components/marketing/content";

/**
 * Root-level OG image. The marketing one is scoped to its route group, so
 * /sign-in, /sign-up and the 404 shared no image at all — a bare link preview
 * for pages that do get shared.
 */

export const alt = "sopher.ai — A sentence in. A finished book out.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  // ImageResponse/Satori renders outside the document cascade, so this asset
  // cannot resolve the semantic CSS variables used by the application. These
  // literals are the static equivalents of the Future Proof tokens.
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#080910",
        color: "#f2f1f6",
        padding: "68px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "48%",
          borderRight: "1px solid #2c2e39",
          paddingRight: "56px",
        }}
      >
        <OgBrand />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 3,
              marginBottom: 28,
              backgroundColor: "#7357e8",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 70,
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
            }}
          >
            <span>A sentence in.</span>
            <span>A finished</span>
            <span>book out.</span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: "62px",
        }}
      >
        {PIPELINE_STEPS.map((stage, index) => (
          <div
            key={stage.name}
            style={{
              display: "flex",
              alignItems: "center",
              height: 76,
              marginLeft: index * 28,
              borderBottom: "1px solid #2c2e39",
            }}
          >
            <span
              style={{
                display: "flex",
                width: 42,
                color: index === 4 ? "#79a9ff" : "#8471ea",
                fontSize: 16,
                fontFamily: "monospace",
              }}
            >
              0{index + 1}
            </span>
            <span style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>{stage.name}</span>
            <span
              style={{
                display: "flex",
                flex: 1,
                height: 1,
                marginLeft: 22,
                backgroundColor: index === 4 ? "#79a9ff" : "#4b3f79",
              }}
            />
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
