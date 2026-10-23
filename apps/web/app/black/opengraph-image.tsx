import { ImageResponse } from "next/og";

export const alt = "Sathyabama Black: something different is coming. Stay curious.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card for /black. It says as little as the page does. */
export default function BlackOpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse 80% 55% at 50% 115%, rgba(150,8,18,0.55), rgba(5,5,5,0) 70%), #050505",
          color: "#ececec",
        }}
      >
        <div style={{ fontSize: 124, fontWeight: 800, letterSpacing: 2, lineHeight: 1, textTransform: "uppercase" }}>
          Sathyabama
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 6 }}>
          <div
            style={{
              fontSize: 232,
              fontWeight: 800,
              lineHeight: 0.9,
              textTransform: "uppercase",
              color: "#8f0d18",
            }}
          >
            Black
          </div>
          <div style={{ width: 30, height: 30, marginLeft: 12, marginBottom: 24, background: "#e01b24" }} />
        </div>
        <div style={{ marginTop: 36, fontSize: 34, color: "#8a8a8a" }}>
          Something different is coming. Stay curious.
        </div>
      </div>
    ),
    size,
  );
}
