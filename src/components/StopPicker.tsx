// React is provided by the application runtime; keep type-checking this file
// usable in environments where its package declarations are not installed.
// @ts-expect-error React declarations may be unavailable in the standalone checker.
import React, { useMemo, useState } from 'react';
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

  return React.createElement(
    'div',
    null,
    React.createElement(
      'label',
      null,
      '停留所名で検索 ',
      React.createElement('input', {
        type: 'search',
        value: query,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
        placeholder: '例：駅前',
      }),
    ),
    query && results.length === 0 && React.createElement('p', null, '該当する乗り場がありません。'),
    results.length > 0 &&
      React.createElement(
        'table',
        { className: 'list' },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            React.createElement('th', null, '停留所名'),
            React.createElement('th', null, 'stop_id'),
            React.createElement('th', null, 'のりば'),
            React.createElement('th', null, '親停留所'),
          ),
        ),
        React.createElement(
          'tbody',
          null,
          ...results.slice(0, MAX_RESULTS).map((s: Row) => {
            const parent = s.parent_station ? stops.get(s.parent_station) : undefined;
            return React.createElement(
              'tr',
              { key: s.stop_id },
              React.createElement(
                'td',
                null,
                React.createElement(
                  'label',
                  null,
                  React.createElement('input', {
                    type: 'radio',
                    name: 'stop',
                    checked: s.stop_id === selectedId,
                    onChange: () => onSelect(s.stop_id),
                  }),
                  ' ',
                  s.stop_name,
                ),
              ),
              React.createElement('td', null, s.stop_id),
              React.createElement('td', null, s.platform_code || '—'),
              React.createElement(
                'td',
                null,
                s.parent_station ? `${parent?.stop_name ?? '（不明）'}（${s.parent_station}）` : '—',
              ),
            );
          }),
        ),
      ),
    results.length > MAX_RESULTS && React.createElement('p', null, `ほか${results.length - MAX_RESULTS}件あります。検索語を絞り込んでください。`),
  );
}