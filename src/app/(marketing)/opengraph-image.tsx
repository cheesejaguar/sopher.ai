import { ImageResponse } from "next/og";

export const alt = "sopher.ai — Your brief. A finished book.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "96px",
        backgroundColor: "#101321",
        color: "#f2f3f7",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 220,
          height: 10,
          borderRadius: 5,
          background: "linear-gradient(90deg, #6672e8, #3aa79c)",
        }}
      />
      <div
        style={{
          display: "flex",
          marginTop: 48,
          fontSize: 104,
          fontWeight: 700,
          letterSpacing: "-0.035em",
        }}
      >
        sopher.ai
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontSize: 42,
          color: "#a2a8bc",
          letterSpacing: "-0.01em",
        }}
      >
        Your brief. A finished book.
      </div>
    </div>,
    { ...size },
  );
}
