import { activeServices, buildServiceIndex, type ServiceIndex } from './calendar';
import { formatDate } from './dates';
import type { Gtfs, Issue, Row } from './types';

export type GtfsIndex = {
  stops: Map<string, Row>;
  routes: Map<string, Row>;
  trips: Map<string, Row>;
  stopTimesByStop: Map<string, Row[]>;
  lastSequenceByTrip: Map<string, number>;
  frequencyTripIds: Set<string>;
  services: ServiceIndex;
};

/** 停留所での1回の出発 */
export type Departure = {
  tripId: string;
  serviceId: string;
  groupKey: string;   // 系統・方面の識別子
  sequence: number;   // stop_sequence（同一便の再通過を区別。F-35）
  minutes: number;    // 運行日0時からの分。25:10 → 1510
  problem?: string;   // 正確に表示できない理由（あれば出力停止）
};

/** 系統・方面（route × direction_id × 行先） */
export type RouteGroup = { key: string; routeName: string; directionId: string; headsign: string; count: number };

/** 同じ出発便の内容を持つ運行日のまとまり（F-22） */
export type Pattern = { key: string; dates: string[]; departures: Departure[] };

const SYMBOLS = ['', '●', '▲', '■', '◆', '★', '○', '△', '□', '◇', '☆'];

const mapBy = (rows: Row[] = [], column: string) => new Map(rows.map((r) => [r[column], r]));

export function buildIndex({ tables }: Gtfs): GtfsIndex {
  const stopTimesByStop = new Map<string, Row[]>();
  const lastSequenceByTrip = new Map<string, number>();
  for (const st of tables.stop_times ?? []) {
    if (!stopTimesByStop.has(st.stop_id)) stopTimesByStop.set(st.stop_id, []);
    stopTimesByStop.get(st.stop_id)!.push(st);
    const seq = Number(st.stop_sequence);
    const last = lastSequenceByTrip.get(st.trip_id);
    if (last === undefined || seq > last) lastSequenceByTrip.set(st.trip_id, seq);
  }
  return {
    stops: mapBy(tables.stops, 'stop_id'),
    routes: mapBy(tables.routes, 'route_id'),
    trips: mapBy(tables.trips, 'trip_id'),
    stopTimesByStop,
    lastSequenceByTrip,
    frequencyTripIds: new Set((tables.frequencies ?? []).map((f) => f.trip_id)),
    services: buildServiceIndex(tables.calendar, tables.calendar_dates),
  };
}

/** "25:10:00" → { minutes: 1510 }。丸めずに、表せない時刻はエラーにする */
export function parseTime(value = ''): { minutes: number } | { error: string } {
  if (!value) return { error: '時刻が未設定の便' };
  const m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!m) return { error: '時刻の形式が不正な便' };
  if (m[3] !== '00') return { error: '秒を含み、分単位で正確に表示できない便' };
  return { minutes: Number(m[1]) * 60 + Number(m[2]) };
}

/** 停留所の乗車可能な出発便と、系統・方面の一覧を求める */
export function analyzeStop(index: GtfsIndex, stopId: string) {
  const departures: Departure[] = [];
  const groups = new Map<string, RouteGroup>();

  for (const st of index.stopTimesByStop.get(stopId) ?? []) {
    const sequence = Number(st.stop_sequence);
    if (sequence === index.lastSequenceByTrip.get(st.trip_id)) continue; // 終着（降車のみ）
    if (st.pickup_type === '1') continue;                                 // 乗車不可（F-34）

    const trip = index.trips.get(st.trip_id);
    const route = trip ? index.routes.get(trip.route_id) : undefined;
    const headsign = st.stop_headsign || trip?.trip_headsign || ''; // 推測で補わない（F-14）
    const directionId = trip?.direction_id ?? '';
    const key = JSON.stringify([trip?.route_id ?? '', directionId, headsign]);

    const group = groups.get(key) ?? {
      key,
      routeName: route?.route_short_name || route?.route_long_name || trip?.route_id || '不明',
      directionId,
      headsign,
      count: 0,
    };
    group.count += 1;
    groups.set(key, group);

    const time = parseTime(st.departure_time || st.arrival_time);
    departures.push({
      tripId: st.trip_id,
      serviceId: trip?.service_id ?? '',
      groupKey: key,
      sequence,
      minutes: 'minutes' in time ? time.minutes : -1,
      problem: findProblem(index, st, trip) ?? ('error' in time ? time.error : undefined),
    });
  }

  departures.sort((a, b) => a.minutes - b.minutes || a.tripId.localeCompare(b.tripId) || a.sequence - b.sequence);
  return { departures, groups: [...groups.values()].sort((a, b) => b.count - a.count) };
}

/** MVPで正しく扱えない条件（F-36, 5.1） */
function findProblem(index: GtfsIndex, st: Row, trip?: Row): string | undefined {
  if (!trip) return 'trips.txt に存在しない便';
  if (index.frequencyTripIds.has(st.trip_id)) return '頻度運行（frequencies.txt）で定義された便';
  if (st.pickup_type && st.pickup_type !== '0') return '条件付き乗車（予約・連絡が必要等）の便';
  return undefined;
}

/** 対象期間の各運行日を、同じ出発内容ごとにまとめる（F-21〜F-23） */
export function buildTimetable(index: GtfsIndex, departures: Departure[], groups: RouteGroup[], dates: string[]) {
  const patterns = new Map<string, Pattern>();
  const problems = new Map<string, Set<string>>();
  const addProblem = (d: Departure) => {
    if (!problems.has(d.problem!)) problems.set(d.problem!, new Set());
    problems.get(d.problem!)!.add(d.tripId);
  };

  departures.filter((d) => d.problem && !d.serviceId).forEach(addProblem); // 運行日が判定できない便

  for (const date of dates) {
    const active = activeServices(index.services, date);
    const running = departures.filter((d) => active.has(d.serviceId));
    running.filter((d) => d.problem).forEach(addProblem);
    const valid = running.filter((d) => !d.problem);
    const key = valid.map((d) => `${d.minutes}:${d.groupKey}`).join('|');
    const pattern = patterns.get(key) ?? { key, dates: [], departures: valid };
    pattern.dates.push(date);
    patterns.set(key, pattern);
  }

  const list = [...patterns.values()];
  return { patterns: list, issues: selectionIssues(index, problems, groups, dates, list) };
}

function selectionIssues(
  index: GtfsIndex,
  problems: Map<string, Set<string>>,
  groups: RouteGroup[],
  dates: string[],
  patterns: Pattern[],
): Issue[] {
  const issues: Issue[] = [];

  for (const [problem, tripIds] of problems) {
    issues.push({
      level: 'stop',
      message: `${problem}が対象に${tripIds.size}便含まれ、正確に表示できません（例：trip_id ${[...tripIds].slice(0, 3).join(', ')}）`,
      action: 'MVPでは未対応です。該当する系統・方面の選択を外すか、GTFSを確認・修正してください。',
    });
  }

  for (const g of groups.filter((g) => !g.headsign)) {
    issues.push({
      level: 'check',
      message: `行先が不明な系統・方面があります（${g.routeName}）。時刻表には「行先：不明」と表示します`,
      action: '運行情報を確認し、必要なら補足注記に記載してください。',
    });
  }

  const { firstDate, lastDate } = index.services;
  if (!firstDate || !lastDate || dates[0] < firstDate || dates[dates.length - 1] > lastDate) {
    const range = firstDate && lastDate ? `${formatDate(firstDate)}〜${formatDate(lastDate)}` : 'なし';
    issues.push({
      level: 'check',
      message: `対象期間の一部が、GTFSの運行日データの範囲（${range}）外です。運休ではなく、データがない可能性があります`,
      action: '対象期間を見直すか、該当期間を含むGTFSを使用してください。',
    });
  }

  if (!patterns.some((p) => p.departures.length > 0)) {
    issues.push({
      level: 'check',
      message: '対象期間・選択条件に該当する乗車可能な便がありません',
      action: '停留所・乗り場、系統・方面、対象期間を確認してください。',
    });
  }
  return issues;
}

/** 系統・方面ごとの記号。最も便数の多いものを無印にする（F-32） */
export function assignSymbols(groups: RouteGroup[]): Map<string, string> {
  return new Map(groups.map((g, i) => [g.key, SYMBOLS[i] ?? `※${i}`]));
}

/** 時ごとに分ける。便のない時間帯も行として残す（F-31） */
export function groupByHour(departures: Departure[]) {
  if (departures.length === 0) return [];
  const hourOf = (d: Departure) => Math.floor(d.minutes / 60);
  const rows: { hour: number; departures: Departure[] }[] = [];
  for (let hour = hourOf(departures[0]); hour <= hourOf(departures[departures.length - 1]); hour++) {
    rows.push({ hour, departures: departures.filter((d) => hourOf(d) === hour) });
  }
  return rows;
}