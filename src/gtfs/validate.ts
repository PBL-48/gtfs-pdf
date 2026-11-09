import { isGtfsDate } from './dates';
import type { Gtfs, Issue } from './types';

const REQUIRED_FILES: Record<string, string[]> = {
  agency: ['agency_name', 'agency_timezone'],
  stops: ['stop_id', 'stop_name'],
  routes: ['route_id'],
  trips: ['route_id', 'service_id', 'trip_id'],
  stop_times: ['trip_id', 'stop_id', 'stop_sequence'],
};

const CALENDAR_FILES: Record<string, string[]> = {
  calendar: ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
  calendar_dates: ['service_id', 'date', 'exception_type'],
};

const FIX = 'GTFSの提供元に確認するか、正しいGTFS ZIPを選択してください。';

/** GTFS全体の検査（F-02）。選択した停留所に関する検査は timetable.ts で行う */
export function validateGtfs({ tables, columns }: Gtfs): Issue[] {
  const issues: Issue[] = [];
  const stop = (message: string) => issues.push({ level: 'stop', message, action: FIX });
  const check = (message: string, action = FIX) => issues.push({ level: 'check', message, action });

  function checkColumns(name: string, required: string[]) {
    const missing = required.filter((c) => !columns[name]?.includes(c));
    if (missing.length > 0) stop(`${name}.txt に必須の列がありません：${missing.join(', ')}`);
  }

  // 1. 必須ファイル・必須列
  for (const [name, required] of Object.entries(REQUIRED_FILES)) {
    if (!tables[name]) stop(`${name}.txt がありません（必須）`);
    else checkColumns(name, required);
  }
  if (!tables.calendar && !tables.calendar_dates) {
    stop('運行日を表す calendar.txt と calendar_dates.txt がどちらもありません');
  }
  for (const [name, required] of Object.entries(CALENDAR_FILES)) {
    if (tables[name]) checkColumns(name, required);
  }

  // 2. 主要IDの参照整合性
  const ids = (name: string, column: string) => new Set((tables[name] ?? []).map((r) => r[column]));
  const serviceIds = new Set([...ids('calendar', 'service_id'), ...ids('calendar_dates', 'service_id')]);
  const refs: [string, string, Set<string>, string][] = [
    ['trips', 'route_id', ids('routes', 'route_id'), 'routes.txt'],
    ['trips', 'service_id', serviceIds, 'calendar.txt / calendar_dates.txt'],
    ['stop_times', 'trip_id', ids('trips', 'trip_id'), 'trips.txt'],
    ['stop_times', 'stop_id', ids('stops', 'stop_id'), 'stops.txt'],
    ['stops', 'parent_station', ids('stops', 'stop_id'), 'stops.txt'],
  ];
  for (const [table, column, valid, target] of refs) {
    const missing = new Set((tables[table] ?? []).map((r) => r[column]).filter((v) => v && !valid.has(v)));
    if (missing.size > 0) {
      check(
        `${table}.txt の ${column} に、${target} に存在しないIDが${missing.size}種類あります（例：${[...missing].slice(0, 3).join(', ')}）`,
        '該当する便・停留所は正しく表示されない可能性があります。提供元に確認してください。',
      );
    }
  }

  // 3. 運行日の値
  const dateValues = [
    ...(tables.calendar ?? []).flatMap((r) => [r.start_date, r.end_date]),
    ...(tables.calendar_dates ?? []).map((r) => r.date),
  ];
  const badDates = dateValues.filter((d) => !isGtfsDate(d ?? ''));
  if (badDates.length > 0) stop(`運行日の日付に不正な値が${badDates.length}件あります（例：${badDates.slice(0, 3).join(', ')}）`);

  const badExceptions = (tables.calendar_dates ?? []).filter((r) => r.exception_type !== '1' && r.exception_type !== '2');
  if (badExceptions.length > 0) stop(`calendar_dates.txt の exception_type に不正な値が${badExceptions.length}件あります`);

  // 4. タイムゾーン
  const zones = new Set((tables.agency ?? []).map((a) => a.agency_timezone).filter(Boolean));
  if (tables.agency && zones.size === 0) check('agency_timezone が未設定です。初期の対象期間は日本時間で設定します');
  if (zones.size > 1) check(`事業者ごとにタイムゾーンが異なります（${[...zones].join(', ')}）`);

  // 5. 情報
  if (tables.frequencies?.length) {
    issues.push({ level: 'info', message: 'frequencies.txt（頻度運行）を含みます。選択した便が該当する場合は出力を停止します。' });
  }
  if (!tables.feed_info) {
    issues.push({ level: 'info', message: 'feed_info.txt がないため、データ版・有効期間は「不明」と表示します。' });
  }
  if (!tables.shapes) {
    issues.push({ level: 'info', message: 'shapes.txt（経路形状）がありません。MVPの時刻表作成には影響しません。' });
  }
  return issues;
}