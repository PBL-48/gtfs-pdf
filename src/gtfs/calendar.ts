import { weekday } from './dates';
import type { Row } from './types';

const DAY_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type ServiceIndex = {
  weekly: Row[];                       // calendar.txt
  added: Map<string, Set<string>>;     // 日付 → 追加運行の service_id
  removed: Map<string, Set<string>>;   // 日付 → 運休の service_id
  firstDate: string | null;            // 運行日データの範囲
  lastDate: string | null;
};

export function buildServiceIndex(calendar: Row[] = [], calendarDates: Row[] = []): ServiceIndex {
  const added = new Map<string, Set<string>>();
  const removed = new Map<string, Set<string>>();
  for (const row of calendarDates) {
    const target = row.exception_type === '1' ? added : row.exception_type === '2' ? removed : null;
    if (!target) continue;
    if (!target.has(row.date)) target.set(row.date, new Set());
    target.get(row.date)!.add(row.service_id);
  }

  const allDates = [
    ...calendar.flatMap((r) => [r.start_date, r.end_date]),
    ...calendarDates.map((r) => r.date),
  ].filter(Boolean).sort();

  return {
    weekly: calendar,
    added,
    removed,
    firstDate: allDates[0] ?? null,
    lastDate: allDates[allDates.length - 1] ?? null,
  };
}

/** 指定運行日に有効な service_id（基本運行日＋追加−運休。F-21） */
export function activeServices(index: ServiceIndex, date: string): Set<string> {
  const dayColumn = DAY_COLUMNS[weekday(date)];
  const result = new Set<string>();
  for (const c of index.weekly) {
    if (c[dayColumn] === '1' && c.start_date <= date && date <= c.end_date) result.add(c.service_id);
  }
  index.added.get(date)?.forEach((id) => result.add(id));
  index.removed.get(date)?.forEach((id) => result.delete(id));
  return result;
}