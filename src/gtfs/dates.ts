// GTFSの日付（YYYYMMDD）を扱う関数群。
// ブラウザのタイムゾーンに影響されないよう、すべてUTCで計算する。

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function toUtc(date: string): Date {
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export const isGtfsDate = (s: string) => /^\d{8}$/.test(s) && fromUtc(toUtc(s)) === s;

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export const weekday = (date: string) => toUtc(date).getUTCDay(); // 0=日曜

export const dayCount = (start: string, end: string) =>
  Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000) + 1;

export function datesBetween(start: string, end: string): string[] {
  const list: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
  return list;
}

/** <input type="date"> の値（YYYY-MM-DD）と相互変換 */
export const inputToGtfs = (value: string) => value.replace(/-/g, '');
export const gtfsToInput = (date: string) => (date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '');

/** 20261109 → 2026/11/9(月) */
export function formatDate(date: string, withYear = true): string {
  const md = `${+date.slice(4, 6)}/${+date.slice(6, 8)}(${WEEKDAY_JA[weekday(date)]})`;
  return withYear ? `${date.slice(0, 4)}/${md}` : md;
}

/** 連続する日付をまとめる：2026/11/9(月)〜11/13(金)、2026/11/16(月) */
export function formatDateRanges(dates: string[]): string {
  if (dates.length === 0) return '';
  const parts: string[] = [];
  let start = dates[0];
  let prev = dates[0];
  for (const date of [...dates.slice(1), '']) {
    if (date && date === addDays(prev, 1)) {
      prev = date;
      continue;
    }
    const sameYear = start.slice(0, 4) === prev.slice(0, 4);
    parts.push(start === prev ? formatDate(start) : `${formatDate(start)}〜${formatDate(prev, !sameYear)}`);
    start = prev = date;
  }
  return parts.join('、');
}

/** 指定タイムゾーンでの今日（初期の対象期間に使う） */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()).replace(/-/g, '');
  } catch {
    return fromUtc(new Date());
  }
}