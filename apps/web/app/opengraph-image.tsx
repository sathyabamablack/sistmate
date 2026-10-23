import { ImageResponse } from "next/og";

export const alt = "Student Portal: attendance, CGPA and LMS for Sathyabama students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card for every page (WhatsApp, Telegram, X, LinkedIn): the 80% line, in the brand pine. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#13483f",
          color: "#f3f6f4",
          padding: 72,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.85 }}>Student Portal</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Can you skip tomorrow&apos;s class?
          </div>
          <div style={{ marginTop: 28, fontSize: 36, opacity: 0.85 }}>
            Attendance, CGPA and LMS for Sathyabama students
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 720, height: 18, borderRadius: 9, background: "rgba(243,246,244,0.2)" }}>
            <div style={{ width: "86%", height: 18, borderRadius: 9, background: "#f3f6f4" }} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 600 }}>80% line</div>
        </div>
      </div>
    ),
    size,
  );
}
