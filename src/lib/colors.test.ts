import { describe, expect, it } from "vitest";
import { CATEGORY_PALETTE, DEFAULT_CATEGORIES, hexToRgba } from "./colors";

describe("hexToRgba", () => {
  it("HEX を rgba に変換する", () => {
    expect(hexToRgba("#2564CF", 0.14)).toBe("rgba(37, 100, 207, 0.14)");
    expect(hexToRgba("#000000", 1)).toBe("rgba(0, 0, 0, 1)");
  });

  it("不正な値はグレーにフォールバックする", () => {
    expect(hexToRgba("red", 0.5)).toBe("rgba(138, 136, 134, 0.5)");
    expect(hexToRgba("#FFF", 0.5)).toBe("rgba(138, 136, 134, 0.5)");
  });
});

describe("既定パレット", () => {
  it("パレットは全て #RRGGBB 形式", () => {
    for (const color of CATEGORY_PALETTE) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("既定カテゴリはパレット内の色を使う", () => {
    for (const seed of DEFAULT_CATEGORIES) {
      expect(CATEGORY_PALETTE).toContain(seed.color);
    }
  });
});
