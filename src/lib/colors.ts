/** Outlook の分類色に準拠した既定パレット */
export const CATEGORY_PALETTE = [
  "#2564CF", // 青
  "#498205", // 緑
  "#8764B8", // 紫
  "#CA5010", // オレンジ
  "#D13438", // 赤
  "#038387", // ティール
  "#986F0B", // 黄土
  "#69797E", // グレー
] as const;

export interface DefaultCategorySeed {
  name: string;
  color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  { name: "開発", color: "#2564CF" },
  { name: "会議", color: "#8764B8" },
  { name: "調査", color: "#038387" },
  { name: "雑務", color: "#CA5010" },
];

/** "#RRGGBB" → "rgba(r,g,b,alpha)"。不正な値は薄いグレーにフォールバック */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return `rgba(138, 136, 134, ${alpha})`;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
