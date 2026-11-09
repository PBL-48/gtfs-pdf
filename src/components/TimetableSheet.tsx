// @ts-expect-error React types are provided by the project runtime.
import { useLayoutEffect, useRef } from 'react';
import { formatDateRanges } from '../gtfs/dates';
import { groupByHour, type Pattern } from '../gtfs/timetable';

/** 全ページ共通の表示内容 */
export type SheetInfo = {
  title: string;
  stopName: string;
  periodLabel: string;
  noServiceText: string;
  legend: { key: string; symbol: string; label: string }[];
  symbols: Map<string, string>;
  note: string;
  metaLabel: string;
  confirmed: boolean;
  blocked: boolean;
};

type Props = {
  pattern: Pattern;
  name: string;
  info: SheetInfo;
  overflow: boolean;
  onOverflow: (overflow: boolean) => void;
};

const A4_HEIGHT_PX = 297 * 96 / 25.4; // CSSの1mm = 96/25.4 px

/** A4縦1枚の時刻表。「時」を行、「分」をセル内に並べる（F-31） */
export function TimetableSheet({ pattern, name, info, overflow, onOverflow }: Props) {
    const ref = useRef<HTMLElement>(null);

    // 描画後に高さを測り、A4に収まらなければ親へ通知（F-46）
    useLayoutEffect(() => {
        if (ref.current) onOverflow(ref.current.offsetHeight > A4_HEIGHT_PX + 1);
    });

    const legend = info.legend.filter((l) => pattern.departures.some((d) => d.groupKey === l.key));
}