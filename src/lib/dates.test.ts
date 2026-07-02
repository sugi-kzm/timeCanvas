import { describe, expect, it } from "vitest";
import {
  addDays,
  addMinutes,
  clampMinutes,
  dayMinuteToIso,
  durationMinutes,
  formatHm,
  formatHours,
  formatMinutesHm,
  fromLocalIso,
  isSameDay,
  minutesOfDay,
  snapMinutes,
  snapMinutesFloor,
  startOfDay,
  startOfWeek,
  toLocalIso,
  weekRangeLabel,
} from "./dates";

describe("toLocalIso / fromLocalIso", () => {
  it("往復変換で値が保たれる", () => {
    const d = new Date(2026, 6, 2, 9, 30, 0);
    expect(fromLocalIso(toLocalIso(d)).getTime()).toBe(d.getTime());
  });

  it("ゼロ埋めされた形式で出力する", () => {
    expect(toLocalIso(new Date(2026, 0, 5, 8, 5, 3))).toBe("2026-01-05T08:05:03");
  });

  it("時刻なしの日付文字列も解釈できる", () => {
    const d = fromLocalIso("2026-07-02");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getHours()).toBe(0);
  });
});

describe("startOfWeek", () => {
  it("水曜日から同じ週の月曜日を返す", () => {
    // 2026-07-02 は木曜日
    const monday = startOfWeek(new Date(2026, 6, 2));
    expect(toLocalIso(monday)).toBe("2026-06-29T00:00:00");
  });

  it("日曜日は前週扱いではなく同じ週の月曜日に戻る", () => {
    // 2026-07-05 は日曜日
    const monday = startOfWeek(new Date(2026, 6, 5));
    expect(toLocalIso(monday)).toBe("2026-06-29T00:00:00");
  });

  it("月曜日はそのまま返る", () => {
    const monday = startOfWeek(new Date(2026, 5, 29, 15, 0));
    expect(toLocalIso(monday)).toBe("2026-06-29T00:00:00");
  });
});

describe("snapMinutes", () => {
  it("最近傍の15分にスナップする", () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(22)).toBe(15);
    expect(snapMinutes(23)).toBe(30);
  });

  it("切り捨てスナップ", () => {
    expect(snapMinutesFloor(29)).toBe(15);
    expect(snapMinutesFloor(30)).toBe(30);
  });
});

describe("clampMinutes", () => {
  it("0〜1440 に収める", () => {
    expect(clampMinutes(-10)).toBe(0);
    expect(clampMinutes(720)).toBe(720);
    expect(clampMinutes(2000)).toBe(1440);
  });
});

describe("日時ヘルパー", () => {
  it("addDays は月をまたぐ", () => {
    expect(toLocalIso(addDays(new Date(2026, 5, 30), 2))).toBe("2026-07-02T00:00:00");
  });

  it("addMinutes / minutesOfDay", () => {
    const d = addMinutes(new Date(2026, 6, 2, 9, 0), 45);
    expect(minutesOfDay(d)).toBe(9 * 60 + 45);
  });

  it("isSameDay は時刻を無視して比較する", () => {
    expect(isSameDay(new Date(2026, 6, 2, 1), new Date(2026, 6, 2, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 6, 2), new Date(2026, 6, 3))).toBe(false);
  });

  it("startOfDay は 0:00 を返す", () => {
    expect(minutesOfDay(startOfDay(new Date(2026, 6, 2, 18, 30)))).toBe(0);
  });

  it("durationMinutes", () => {
    expect(durationMinutes("2026-07-02T09:00:00", "2026-07-02T10:30:00")).toBe(90);
  });

  it("dayMinuteToIso は日付と分から ISO を作る", () => {
    expect(dayMinuteToIso(new Date(2026, 6, 2), 570)).toBe("2026-07-02T09:30:00");
  });
});

describe("表示フォーマット", () => {
  it("formatHm / formatMinutesHm", () => {
    expect(formatHm(new Date(2026, 6, 2, 9, 5))).toBe("9:05");
    expect(formatMinutesHm(570)).toBe("9:30");
  });

  it("formatHours は小数1桁で丸める", () => {
    expect(formatHours(90)).toBe("1.5");
    expect(formatHours(60)).toBe("1");
    expect(formatHours(100)).toBe("1.7");
  });

  it("weekRangeLabel は同一年なら終端の年を省略", () => {
    expect(weekRangeLabel(new Date(2026, 5, 29))).toBe("2026年6月29日 - 7月5日");
  });

  it("weekRangeLabel は年またぎで両方の年を表示", () => {
    expect(weekRangeLabel(new Date(2026, 11, 28))).toBe("2026年12月28日 - 2027年1月3日");
  });
});
