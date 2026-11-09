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

const A4_HEIGHT_PX = (297 * 96) / 25.4; // CSSの1mm = 96/25.4 px

/** A4縦1枚の時刻表。「時」を行、「分」をセル内に並べる（F-31） */
export function TimetableSheet({ pattern, name, info, overflow, onOverflow }: Props) {
  const ref = useRef<HTMLElement>(null);

  // 描画後に高さを測り、A4に収まらなければ親へ通知（F-46）
  useLayoutEffect(() => {
    if (ref.current) onOverflow(ref.current.offsetHeight > A4_HEIGHT_PX + 1);
  });

  const legend = info.legend.filter((l) => pattern.departures.some((d) => d.groupKey === l.key));
  const rows = groupByHour(pattern.departures);
  const hasLateNight = rows.some((r) => r.hour >= 24);

  return (
    <article ref={ref} className={`sheet${overflow ? ' overflow' : ''}`}>
      {(!info.confirmed || info.blocked) && <div className="watermark">確認前・掲示不可</div>}

      <header>
        <h1>{info.title}</h1>
        <p className="stop-name">{info.stopName}</p>
        <p><strong>{name}</strong>　適用日：{formatDateRanges(pattern.dates)}</p>
        <p>対象期間：{info.periodLabel}</p>
        {info.noServiceText && <p>運行のない日：{info.noServiceText}</p>}
      </header>

      <table className="timetable">
        <thead>
          <tr><th scope="col">時</th><th scope="col">分</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hour}>
              <th scope="row">{row.hour}</th>
              <td>
                {row.departures.map((d) => (
                  <span key={`${d.tripId}-${d.sequence}`} className="minute">
                    {info.symbols.get(d.groupKey)}
                    {String(d.minutes % 60).padStart(2, '0')}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer>
        <ul className="legend">
          {legend.map((l) => (
            <li key={l.key}>{l.symbol || '無印'}：{l.label}</li>
          ))}
        </ul>
        {hasLateNight && <p>24時以降の時刻は深夜0時を過ぎた時刻です（例：25時台＝翌日1時台）。</p>}
        {info.note && <p className="note">{info.note}</p>}
        <p>運行情報は変更される場合があります。最新の情報は事業者にご確認ください。</p>
        <p className="meta">{info.metaLabel}</p>
      </footer>
    </article>
  );
}