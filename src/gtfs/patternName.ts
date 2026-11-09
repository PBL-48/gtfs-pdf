import { weekday } from './dates';
import type { Pattern } from './timetable';

const DAY_TYPES = ['平日', '土曜', '日曜'] as const;
type DayType = (typeof DAY_TYPES)[number];

function dayType(date: string): DayType {
  const w = weekday(date);
  return w === 0 ? '日曜' : w === 6 ? '土曜' : '平日';
}

function countByType(dates: string[]): Record<DayType, number> {
  const count = { 平日: 0, 土曜: 0, 日曜: 0 };
  for (const d of dates) count[dayType(d)] += 1;
  return count;
}

/**
 * 適用日の曜日構成から「平日」「土曜」「日曜・祝日」等の名前を推定する。
 * 祝日は暦ではなく「平日なのに平日パターンに含まれない日」として扱う。
 */
export function guessPatternNames(patterns: Pattern[], periodDates: string[]): string[] {
  const total = countByType(periodDates);
  const names = patterns.map((p) => guessName(countByType(p.dates), total));

  // 同じ名前が複数あれば番号を付ける：平日（1）、平日（2）
  const seen = new Map<string, number>();
  return names.map((name) => {
    if (names.filter((n) => n === name).length === 1) return name;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return `${name}（${n}）`;
  });
}

function guessName(count: Record<DayType, number>, total: Record<DayType, number>): string {
  // 期間中のその曜日の半数を超えて含む → 主な曜日
  const main = DAY_TYPES.filter((t) => count[t] > total[t] / 2);
  if (main.length === 0) return '特定日';
  if (main.length === 3) return '毎日';

  const base = main.join('・').replace('土曜・日曜', '土日');
  const hasHoliday = !main.includes('平日') && count.平日 > 0;
  if (!hasHoliday) return base;
  return base === '土日' ? '土日祝' : `${base}・祝日`;
}