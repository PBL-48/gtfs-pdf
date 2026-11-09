import { activeServices, buildServiceIndex, type ServiceIndex } from './calendar';
import { formatDate } from './dates';
import type { Gtfs, Issue, Row } from './types';

export type GtfsIndex = {
  stops: Map<string, Row>;
  routes: Map<string, Row>;
  trips: Map<string, Row>;
  stopTimesByStop: Map<string, Row[]>;
  stopTimesByTrip: Map<string, Row[]>; // stop_sequence 順
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

/** 系統・方面。route × direction_id × 行先表示 × 次の停留所 × 先の主な停留所 × 終点 */
export type RouteGroup = {
  key: string;
  routeName: string;
  directionId: string;
  headsign: string;
  next: string;         // 次の停留所名
  toward: string;       // 先の主な停留所（行先表示に含まれる停留所のうち、この先で最初に通るもの）
  terminal: string;     // 終点の停留所名
  sampleTripId: string; // 確認用の便の例
  count: number;
};

/** 同じ出発便の内容を持つ運行日のまとまり（F-22） */
export type Pattern = { key: string; dates: string[]; departures: Departure[] };

const mapBy = (rows: Row[] = [], column: string) => new Map(rows.map((r) => [r[column], r]));

function groupBy(rows: Row[], column: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    if (!map.has(r[column])) map.set(r[column], []);
    map.get(r[column])!.push(r);
  }
  return map;
}

export function buildIndex({ tables }: Gtfs): GtfsIndex {
  const stopTimes = tables.stop_times ?? [];
  const stopTimesByTrip = groupBy(stopTimes, 'trip_id');
  stopTimesByTrip.forEach((list) => list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence)));
  return {
    stops: mapBy(tables.stops, 'stop_id'),
    routes: mapBy(tables.routes, 'route_id'),
    trips: mapBy(tables.trips, 'trip_id'),
    stopTimesByStop: groupBy(stopTimes, 'stop_id'),
    stopTimesByTrip,
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

/** 行先表示を停留所名の候補に分ける：「国立駅北口・国立駅南口・市役所循環」→ [国立駅北口, 国立駅南口, 市役所] */
function headsignStops(headsign: string): string[] {
  return headsign
    .replace(/(行き|行|ゆき)$/, '')
    .replace(/循環|経由|方面/g, '・')
    .split(/[・･、,／/\s]+/)
    .filter(Boolean);
}

/** この先で最初に通る、行先表示に含まれる停留所（なければ空） */
function findToward(rest: string[], here: string, headsign: string): string {
  const tokens = headsignStops(headsign);
  return rest.find((name) => name !== here && tokens.some((t) => name.includes(t) || t.includes(name))) ?? '';
}

/** 停留所の乗車可能な出発便と、系統・方面の一覧を求める */
export function analyzeStop(index: GtfsIndex, stopId: string) {
  const departures: Departure[] = [];
  const groups = new Map<string, RouteGroup>();
  const nameOf = (id: string) => index.stops.get(id)?.stop_name ?? id;

  for (const st of index.stopTimesByStop.get(stopId) ?? []) {
    const tripStops = index.stopTimesByTrip.get(st.trip_id) ?? [];
    const position = tripStops.indexOf(st);
    const next = tripStops[position + 1];
    if (!next) continue;                  // 終着（降車のみ）
    if (st.pickup_type === '1') continue; // 乗車不可（F-34）

    const trip = index.trips.get(st.trip_id);
    const route = trip ? index.routes.get(trip.route_id) : undefined;
    const headsign = st.stop_headsign || trip?.trip_headsign || ''; // 推測で補わない（F-14）
    const directionId = trip?.direction_id ?? '';
    // 行先表示・次の停留所が同じでも、その先で行先が分かれる場合がある（循環・同じのりばの上り下り）
    const rest = tripStops.slice(position + 1).map((r) => nameOf(r.stop_id));
    const nextName = rest[0];
    const toward = findToward(rest, nameOf(stopId), headsign);
    const terminal = rest[rest.length - 1];
    const key = JSON.stringify([trip?.route_id ?? '', directionId, headsign, nextName, toward, terminal]);

    const group = groups.get(key) ?? {
      key,
      routeName: route?.route_short_name || route?.route_long_name || trip?.route_id || '不明',
      directionId,
      headsign,
      next: nextName,
      toward,
      terminal,
      sampleTripId: st.trip_id,
      count: 0,
    };
    group.count += 1;
    groups.set(key, group);

    const time = parseTime(st.departure_time || st.arrival_time);
    departures.push({
      tripId: st.trip_id,
      serviceId: trip?.service_id ?? '',
      groupKey: key,
      sequence: Number(st.stop_sequence),
      minutes: 'minutes' in time ? time.minutes : -1,
      problem: findProblem(index, st, trip) ?? ('error' in time ? time.error : undefined),
    });
  }

  departures.sort((a, b) => a.minutes - b.minutes || a.tripId.localeCompare(b.tripId) || a.sequence - b.sequence);
  return { departures, groups: [...groups.values()].sort((a, b) => b.count - a.count) };
}

/** 行先表示と終点が同じ別の系統（＝行先表示だけでは区別できない） */
const twinsOf = (g: RouteGroup, all: RouteGroup[]) =>
  all.filter((o) => o.key !== g.key && o.headsign === g.headsign && o.terminal === g.terminal);

/** 系統・方面の自動の説明文（画面・凡例で共通） */
export function describeGroup(g: RouteGroup, all: RouteGroup[] = []): string {
  const parts = [`行先：${g.headsign || '不明'}`];
  if (g.terminal && !g.headsign.includes(g.terminal)) parts.push(`終点：${g.terminal}`);
  const twins = twinsOf(g, all);
  if (twins.length > 0) {
    // 先の主な停留所で区別できればそれを、できなければ次の停留所を使う
    const useToward = g.toward && !twins.some((o) => o.toward === g.toward);
    parts.push(`${useToward ? g.toward : g.next}方面`);
  }
  return `${g.routeName}（${parts.join('／')}）`;
}

/** MVPで正しく扱えない条件（F-36, 5.1） */
function findProblem(index: GtfsIndex, st: Row, trip?: Row): string | undefined {
  if (!trip) return 'trips.txt に存在しない便';
  if (index.frequencyTripIds.has(st.trip_id)) return '頻度運行（frequencies.txt）で定義された便';
  if (st.pickup_type && st.pickup_type !== '0') return '条件付き乗車（予約・連絡が必要等）の便';
  return undefined;
}

/** 同じ系統・方面の中で、同じ便が2回以上出てくるもの（方向の区別に失敗している可能性） */
function findRevisits(departures: Departure[]): string[] {
  const seen = new Map<string, Set<string>>();
  const revisited = new Set<string>();
  for (const d of departures) {
    if (!seen.has(d.groupKey)) seen.set(d.groupKey, new Set());
    const trips = seen.get(d.groupKey)!;
    if (trips.has(d.tripId)) revisited.add(d.tripId);
    trips.add(d.tripId);
  }
  return [...revisited];
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
  const issues = selectionIssues(index, problems, groups, dates, list);
  const revisits = findRevisits(departures);
  if (revisits.length > 0) {
    issues.push({
      level: 'check',
      message: `同じ便がこの乗り場を2回以上通り、同じ系統・方面にまとめられています（例：trip_id ${revisits.slice(0, 3).join(', ')}）`,
      action: '行先を区別できていない可能性があります。stop_times.txt で該当便の経路を確認してください。',
    });
  }
  return { patterns: list, issues };
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
      message: `行先が不明な系統・方面があります（${describeGroup(g, groups)}）。時刻表には「行先：不明」と表示します`,
      action: '「3. 系統・方面」で凡例の文言を入力してください。',
    });
  }

  const twins = groups.filter((g) => twinsOf(g, groups).length > 0);
  if (twins.length > 0) {
    issues.push({
      level: 'check',
      message: `行先表示と終点が同じで、経路だけが異なる系統・方面があります（${twins.map((g) => describeGroup(g, groups)).join('、')}）`,
      action: '同じのりばの上り・下りや循環の回り方の違いである可能性があります。「3. 系統・方面」で凡例の文言と略号を確認してください。',
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