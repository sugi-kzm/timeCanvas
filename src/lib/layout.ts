/**
 * 同じ日の中で時間帯が重なるエントリを、Outlook のように横に並べるための
 * 列割り当てを計算する。
 */
export interface Positioned {
  id: string;
  startMin: number;
  endMin: number;
}

export interface SlotPosition {
  /** 0 始まりの列番号 */
  column: number;
  /** そのクラスタ（連結する重なりグループ）の総列数 */
  columns: number;
}

export function layoutOverlaps(items: readonly Positioned[]): Map<string, SlotPosition> {
  const result = new Map<string, SlotPosition>();
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );

  let cluster: Positioned[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const assigned = new Map<string, number>();
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[col] = item.endMin;
      }
      assigned.set(item.id, col);
    }
    const total = columnEnds.length;
    for (const item of cluster) {
      result.set(item.id, { column: assigned.get(item.id) ?? 0, columns: total });
    }
    cluster = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) {
      flushCluster();
      clusterEnd = -1;
    }
    cluster = [...cluster, item];
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flushCluster();

  return result;
}
