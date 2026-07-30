/**
 * Satori-safe version of the stacked-folio mark used by generated social
 * images. Keep its geometry in lockstep with BrandMark.
 */
export function OgBrand() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        color: "#f4f2f8",
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        width="30"
        height="30"
        style={{ marginRight: 16 }}
      >
        <path
          d="M11 4.5h15.5V24H11z"
          fill="none"
          stroke="#f4f2f8"
          strokeWidth="1.25"
          opacity=".42"
        />
        <path d="M5.5 8H22v5H10.5v3H22v10H5.5v-5h11.25v-3H5.5z" fill="#f4f2f8" />
        <path d="M22 8v5h4.5" fill="none" stroke="#65dcf6" strokeWidth="1.5" />
      </svg>
      <span style={{ display: "flex" }}>
        sopher<span style={{ color: "#a997ff" }}>.ai</span>
      </span>
    </div>
  );
}
