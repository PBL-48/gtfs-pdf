import { useMemo, useState } from 'react';
import type { Row } from '../gtfs/types';

const MAX_RESULTS = 50;

type Props = {
  stops: Map<string, Row>;
  selectedId: string;
  onSelect: (stopId: string) => void;
};

/** 乗り場（location_type が空 or 0）だけを選択対象にする */
const isBoardingPoint = (s: Row) => !s.location_type || s.location_type === '0';

/** 停留所検索。同名の乗り場は統合せず、stop_id・のりば・親停留所を並べて表示（F-10〜F-12） */
export function StopPicker({ stops, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return [...stops.values()].filter((s) => isBoardingPoint(s) && (s.stop_name?.includes(q) || s.stop_id === q));
  }, [stops, query]);

  return (
    <div>
      <label>
        停留所名で検索{' '}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例：駅前" />
      </label>
      {query && results.length === 0 && <p>該当する乗り場がありません。</p>}
      {results.length > 0 && (
        <table className="list">
          <thead>
            <tr><th>停留所名</th><th>stop_id</th><th>のりば</th><th>親停留所</th></tr>
          </thead>
          <tbody>
            {results.slice(0, MAX_RESULTS).map((s) => {
              const parent = s.parent_station ? stops.get(s.parent_station) : undefined;
              return (
                <tr key={s.stop_id}>
                  <td>
                    <label>
                      <input type="radio" name="stop" checked={s.stop_id === selectedId} onChange={() => onSelect(s.stop_id)} />{' '}
                      {s.stop_name}
                    </label>
                  </td>
                  <td>{s.stop_id}</td>
                  <td>{s.platform_code || '—'}</td>
                  <td>{s.parent_station ? `${parent?.stop_name ?? '（不明）'}（${s.parent_station}）` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {results.length > MAX_RESULTS && <p>ほか{results.length - MAX_RESULTS}件あります。検索語を絞り込んでください。</p>}
    </div>
  );
}