import { describe, expect, it } from "vitest";
import { maxSafeSkips, projectAttendance, suggestSkips } from "../src/projection";
import { DEFAULT_ATTENDANCE_THRESHOLD } from "../src/calc";

const meets = (a: number, t: number, T: number) => 100 * a >= T * t;

describe("projectAttendance", () => {
  it("leaves the numbers alone when nothing changes", () => {
    expect(projectAttendance({ attended: 42, total: 48 }, 0, 0, 75)).toMatchObject({
      attended: 42,
      total: 48,
      margin: 8,
      safe: true,
    });
  });

  it("uses the 80% requirement by default", () => {
    expect(DEFAULT_ATTENDANCE_THRESHOLD).toBe(80);
    // 42 of 48 is 87.5%: 4 spare hours at 80, where it had 8 at 75.
    expect(projectAttendance({ attended: 42, total: 48 }, 0)).toMatchObject({
      margin: 4,
      safe: true,
    });
    // 36 of 48 is exactly 75%, now below the line.
    expect(projectAttendance({ attended: 36, total: 48 }, 0)).toMatchObject({ safe: false });
  });

  it("counts skipped hours as held but missed", () => {
    // 42/48 skip 3 -> 42/51 = 82.35%
    const p = projectAttendance({ attended: 42, total: 48 }, 3);
    expect(p.total).toBe(51);
    expect(p.attended).toBe(42);
    expect(p.percentage).toBeCloseTo(82.35, 2);
    expect(p.safe).toBe(true);
  });

  it("counts extra attended hours as held and attended", () => {
    const p = projectAttendance({ attended: 30, total: 48 }, 0, 4);
    expect(p).toMatchObject({ attended: 34, total: 52, safe: false });
  });

  it("reports the buffer as spare hours when safe and as a negative shortfall when not", () => {
    // 33/44 is exactly 75%: no spare hour, one miss tips it over
    expect(projectAttendance({ attended: 33, total: 44 }, 0, 0, 75).margin).toBe(0);
    const miss = projectAttendance({ attended: 33, total: 44 }, 1, 0, 75);
    expect(miss.safe).toBe(false);
    expect(miss.margin).toBe(-3); // 33/45: attend 3 straight to reach 36/48 = 75%
    expect(meets(33 + 3, 45 + 3, 75)).toBe(true);
    expect(meets(33 + 2, 45 + 2, 75)).toBe(false);
  });

  it("does not flip an exact threshold to unsafe", () => {
    expect(projectAttendance({ attended: 3, total: 4 }, 0, 0, 75).safe).toBe(true);
    expect(projectAttendance({ attended: 6, total: 7 }, 1, 0, 75).percentage).toBeCloseTo(75, 10);
    expect(projectAttendance({ attended: 6, total: 7 }, 1, 0, 75).safe).toBe(true);
    // The same at the 80% default: 4 of 5 is exactly 80 and stays safe.
    expect(projectAttendance({ attended: 4, total: 5 }, 0).safe).toBe(true);
  });

  it("honours a custom threshold", () => {
    const p = projectAttendance({ attended: 36, total: 50 }, 0, 0, 70);
    expect(p.safe).toBe(true);
    expect(projectAttendance({ attended: 36, total: 50 }, 0, 0, 75).safe).toBe(false);
  });

  it("ignores negative and fractional inputs", () => {
    expect(projectAttendance({ attended: 10, total: 10 }, -4, -1)).toMatchObject({ total: 10 });
    expect(projectAttendance({ attended: 10, total: 10 }, 2.9)).toMatchObject({ total: 12 });
  });

  it("treats a subject with no hours as 100% and safe", () => {
    expect(projectAttendance({ attended: 0, total: 0 }, 0)).toMatchObject({
      percentage: 100,
      safe: true,
      margin: 0,
    });
  });
});

describe("maxSafeSkips", () => {
  it("agrees with brute force over many shapes", () => {
    for (const T of [60, 75, 80]) {
      for (let total = 0; total <= 30; total += 3) {
        for (let attended = 0; attended <= total; attended += 2) {
          for (let held = 0; held <= 8; held++) {
            let expected = 0;
            for (let s = 0; s <= held; s++) {
              if (meets(attended + held - s, total + held, T)) expected = s;
            }
            if (!meets(attended + held, total + held, T)) expected = 0;
            expect(maxSafeSkips({ attended, total }, held, T), `${attended}/${total} +${held} @${T}`).toBe(
              expected,
            );
          }
        }
      }
    }
  });

  it("is zero for a subject that stays below the line even when attending everything", () => {
    expect(maxSafeSkips({ attended: 30, total: 48 }, 4)).toBe(0);
  });

  it("never exceeds the hours actually scheduled", () => {
    expect(maxSafeSkips({ attended: 100, total: 100 }, 3)).toBe(3);
  });

  it("lets a future class pay for itself, so 4 held hours allow one miss from 0/0", () => {
    // At 75%, 3 of 4 clears the line; at 80% it takes 5 held hours for 4 of 5.
    expect(maxSafeSkips({ attended: 0, total: 0 }, 4, 75)).toBe(1);
    expect(maxSafeSkips({ attended: 0, total: 0 }, 4)).toBe(0);
    expect(maxSafeSkips({ attended: 0, total: 0 }, 5)).toBe(1);
  });
});

describe("suggestSkips", () => {
  const subjects = [
    { code: "A", attended: 42, total: 48 }, // lots of room
    { code: "B", attended: 38, total: 50 }, // some room
    { code: "C", attended: 30, total: 48 }, // below the line
    { code: "D", attended: 33, total: 44 }, // exactly 75%
  ];
  /** The shapes above were chosen against the old 75% line, so these cases state it. */
  const T = 75;
  const cls = (code: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `${code}${i + 1}`, code }));

  it("never suggests a class that would drop a subject below the threshold", () => {
    const classes = [...cls("A", 5), ...cls("B", 5), ...cls("C", 4), ...cls("D", 3)];
    const picks = suggestSkips(subjects, classes, T);
    const skipped = (code: string) => picks.filter((p) => p.code === code).length;
    for (const s of subjects.filter((x) => x.code !== "C")) {
      const held = classes.filter((c) => c.code === s.code).length;
      const p = projectAttendance(s, skipped(s.code), held - skipped(s.code), T);
      expect(p.safe, s.code).toBe(true);
    }
    expect(skipped("C")).toBe(0);
  });

  it("takes the most skippable subjects first and then alternates", () => {
    const picks = suggestSkips(subjects, [...cls("B", 5), ...cls("A", 5)]);
    expect(picks[0]!.code).toBe("A");
    // A has far more room than B: it leads until B catches up
    const order = picks.map((p) => p.code).join("");
    expect(order.startsWith("AA")).toBe(true);
    expect(order.length).toBe(maxSafeSkips(subjects[0]!, 5) + maxSafeSkips(subjects[1]!, 5));
  });

  it("takes a subject's classes earliest first", () => {
    const picks = suggestSkips([subjects[0]!], cls("A", 4));
    expect(picks.map((p) => p.id)).toEqual(["A1", "A2", "A3", "A4"].slice(0, picks.length));
    expect(picks.length).toBeGreaterThan(0);
  });

  it("ignores classes of subjects without an attendance record and breaks ties by code", () => {
    const tie = [
      { code: "X", attended: 40, total: 40 },
      { code: "W", attended: 40, total: 40 },
    ];
    const picks = suggestSkips(tie, [...cls("X", 2), ...cls("W", 2), ...cls("Z", 3)]);
    expect(picks.some((p) => p.code === "Z")).toBe(false);
    expect(picks[0]!.code).toBe("W");
  });

  it("suggests nothing when the week is empty", () => {
    expect(suggestSkips(subjects, [])).toEqual([]);
  });
});
