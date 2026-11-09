import { describe, expect, it } from 'vitest';
import { datesBetween } from '../src/gtfs/dates';
import { assignMarks } from '../src/gtfs/marks';
import { analyzeStop, buildIndex, buildTimetable, groupByHour, parseTime } from '../src/gtfs/timetable';
import type { Gtfs } from '../src/gtfs/types';
import { assignMarks, duplicateMarks } from '../src/gtfs/marks';
import { analyzeStop, buildIndex, buildTimetable, describeGroup, groupByHour, parseTime } from '../src/gtfs/timetable';
const days = (mon: string, sat: string, sun: string) => ({
  monday: mon, tuesday: mon, wednesday: mon, thursday: mon, friday: mon, saturday: sat, sunday: sun,
  start_date: '20261101', end_date: '20261130',
});

/** テスト用の小さなGTFS。毎回新しいオブジェクトを返す */
function sampleGtfs(): Gtfs {
  return {
    columns: {},
    tables: {
      stops: [
        { stop_id: 'S1', stop_name: '駅前' },
        { stop_id: 'S2', stop_name: '市役所' },
      ],
      routes: [{ route_id: 'R1', route_short_name: '1系統' }],
      trips: [
        { trip_id: 'T1', route_id: 'R1', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: '市役所' },
        { trip_id: 'T2', route_id: 'R1', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: '市役所' },
        { trip_id: 'T3', route_id: 'R1', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: '市役所' },
        { trip_id: 'T4', route_id: 'R1', service_id: 'SAT', direction_id: '1', trip_headsign: '' },
      ],
      stop_times: [
        { trip_id: 'T1', stop_id: 'S1', stop_sequence: '1', departure_time: '07:05:00' },
        { trip_id: 'T1', stop_id: 'S2', stop_sequence: '2', departure_time: '07:20:00' },
        { trip_id: 'T2', stop_id: 'S1', stop_sequence: '1', departure_time: '25:10:00' }, // 深夜便
        { trip_id: 'T2', stop_id: 'S2', stop_sequence: '2', departure_time: '25:25:00' },
        { trip_id: 'T3', stop_id: 'S1', stop_sequence: '1', departure_time: '08:00:00', pickup_type: '1' }, // 乗車不可
        { trip_id: 'T3', stop_id: 'S2', stop_sequence: '2', departure_time: '08:15:00' },
        { trip_id: 'T4', stop_id: 'S1', stop_sequence: '1', departure_time: '09:00:00' },
        { trip_id: 'T4', stop_id: 'S2', stop_sequence: '2', departure_time: '09:15:00' },
      ],
      calendar: [
        { service_id: 'WEEKDAY', ...days('1', '0', '0') },
        { service_id: 'SAT', ...days('0', '1', '0') },
      ],
    },
  };
}

/** 右回り・左回りの循環系統。行先表示はどちらも「循環」 */
function loopGtfs(): Gtfs {
  return {
    columns: {},
    tables: {
      stops: [
        { stop_id: 'A', stop_name: '駅前' },
        { stop_id: 'B', stop_name: '市役所' },
        { stop_id: 'C', stop_name: '公園' },
      ],
      routes: [{ route_id: 'L', route_short_name: '循環線' }],
      trips: [
        { trip_id: 'CW', route_id: 'L', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: '循環' },
        { trip_id: 'CCW', route_id: 'L', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: '循環' },
      ],
      stop_times: [
        { trip_id: 'CW', stop_id: 'A', stop_sequence: '1', departure_time: '07:00:00' },
        { trip_id: 'CW', stop_id: 'B', stop_sequence: '2', departure_time: '07:10:00' },
        { trip_id: 'CW', stop_id: 'C', stop_sequence: '3', departure_time: '07:20:00' },
        { trip_id: 'CW', stop_id: 'A', stop_sequence: '4', departure_time: '07:30:00' },
        { trip_id: 'CCW', stop_id: 'A', stop_sequence: '1', departure_time: '08:00:00' },
        { trip_id: 'CCW', stop_id: 'C', stop_sequence: '2', departure_time: '08:10:00' },
        { trip_id: 'CCW', stop_id: 'B', stop_sequence: '3', departure_time: '08:20:00' },
        { trip_id: 'CCW', stop_id: 'A', stop_sequence: '4', departure_time: '08:30:00' },
      ],
      calendar: [{ service_id: 'WEEKDAY', ...days('1', '0', '0') }],
    },
  };
}

const WEEK = datesBetween('20261109', '20261115'); // 月〜日

describe('parseTime', () => {
  it('24時以降も運行日0時からの分で表す', () => {
    expect(parseTime('25:10:00')).toEqual({ minutes: 1510 });
    expect(parseTime('7:05:00')).toEqual({ minutes: 425 });
  });

  it('丸めずにエラーにする', () => {
    expect(parseTime('07:05:30')).toHaveProperty('error');
    expect(parseTime('')).toHaveProperty('error');
    expect(parseTime('abc')).toHaveProperty('error');
  });
});

describe('analyzeStop', () => {
  const index = buildIndex(sampleGtfs());

  it('乗車不可の便と終着を除き、時刻順に並べる', () => {
    const { departures } = analyzeStop(index, 'S1');
    expect(departures.map((d) => d.tripId)).toEqual(['T1', 'T4', 'T2']);
  });

  it('終着停留所では出発便がない', () => {
    expect(analyzeStop(index, 'S2').departures).toHaveLength(0);
  });

  it('最多の系統を無印、ほかを行先・終点の漢字1文字にする', () => {
    const { groups } = analyzeStop(index, 'S1');
    expect(groups.map((g) => [g.headsign, g.count])).toEqual([['市役所', 2], ['', 1]]);
    const marks = assignMarks(groups);
    expect(marks.get(groups[0].key)).toBe('');
    expect(marks.get(groups[1].key)).toBe('市'); // 行先不明だが終点が市役所
  });
});

/** 国立駅南口から、どちらも国立公民館を経て、市役所方面と北口方面に分かれる（行先表示は同じ） */
function sharedPlatformGtfs(): Gtfs {
  const headsign = '国立駅北口・国立駅南口・市役所循環';
  return {
    columns: {},
    tables: {
      stops: [
        { stop_id: 'N', stop_name: '国立駅北口' },
        { stop_id: 'S', stop_name: '国立駅南口' },
        { stop_id: 'K', stop_name: '国立公民館' },
        { stop_id: 'C', stop_name: '国立市役所' },
      ],
      routes: [{ route_id: 'R', route_short_name: 'くにっこ北西中ルート' }],
      trips: [
        { trip_id: 'T1', route_id: 'R', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: headsign },
        { trip_id: 'T2', route_id: 'R', service_id: 'WEEKDAY', direction_id: '0', trip_headsign: headsign },
      ],
      stop_times: [
        { trip_id: 'T1', stop_id: 'S', stop_sequence: '1', departure_time: '09:00:00' },
        { trip_id: 'T1', stop_id: 'K', stop_sequence: '2', departure_time: '09:03:00' },
        { trip_id: 'T1', stop_id: 'C', stop_sequence: '3', departure_time: '09:10:00' },
        { trip_id: 'T1', stop_id: 'N', stop_sequence: '4', departure_time: '09:20:00' },
        { trip_id: 'T2', stop_id: 'S', stop_sequence: '1', departure_time: '09:02:00' },
        { trip_id: 'T2', stop_id: 'K', stop_sequence: '2', departure_time: '09:05:00' },
        { trip_id: 'T2', stop_id: 'N', stop_sequence: '3', departure_time: '09:12:00' },
      ],
      calendar: [{ service_id: 'WEEKDAY', ...days('1', '0', '0') }],
    },
  };
}
function sharedPlatformGtfs(): Gtfs {
  return {
    columns: {},
    tables: {
      stops: [
        { stop_id: 'N', stop_name: '国立駅北口' },
        { stop_id: 'S', stop_name: '国立駅南口' },
        { stop_id: 'H', stop_name: '国立病院' },
      ],
      routes: [{ route_id: 'K', route_short_name: 'くにっこ' }],
      trips: [
        { trip_id: 'OUT', route_id: 'K', service_id: 'WEEKDAY', trip_headsign: 'くにっこ' },
        { trip_id: 'IN', route_id: 'K', service_id: 'WEEKDAY', trip_headsign: 'くにっこ' },
      ],
      stop_times: [
        { trip_id: 'OUT', stop_id: 'N', stop_sequence: '1', departure_time: '09:00:00' },
        { trip_id: 'OUT', stop_id: 'S', stop_sequence: '2', departure_time: '09:05:00' },
        { trip_id: 'OUT', stop_id: 'H', stop_sequence: '3', departure_time: '09:20:00' },
        { trip_id: 'IN', stop_id: 'H', stop_sequence: '1', departure_time: '10:00:00' },
        { trip_id: 'IN', stop_id: 'S', stop_sequence: '2', departure_time: '10:15:00' },
        { trip_id: 'IN', stop_id: 'N', stop_sequence: '3', departure_time: '10:20:00' },
      ],
      calendar: [{ service_id: 'WEEKDAY', ...days('1', '0', '0') }],
    },
  };
}

describe('方向の区別', () => {
  it('循環系統：行先表示が同じでも、回り方（次の停留所）で別の系統にする', () => {
    const index = buildIndex(loopGtfs());
    const { departures, groups } = analyzeStop(index, 'A');
    expect(departures).toHaveLength(2); // 終着（seq 4）は除く
    expect(groups.map((g) => g.next)).toEqual(['市役所', '公園']);
    expect(assignMarks(groups).get(groups[1].key)).toBe('公');
    expect(describeGroup(groups[1], groups)).toContain('公園方面');
  });

  it('次の停留所が同じでも、先の主な停留所で上り・下りを区別する', () => {
    const index = buildIndex(sharedPlatformGtfs());
    const { groups } = analyzeStop(index, 'S');
    expect(groups.map((g) => g.next)).toEqual(['国立公民館', '国立公民館']);
    expect(groups.map((g) => g.toward)).toEqual(['国立市役所', '国立駅北口']);
    expect(describeGroup(groups[0], groups)).toContain('国立市役所方面');
    expect(describeGroup(groups[1], groups)).toContain('国立駅北口方面');

    const marks = assignMarks(groups);
    expect(marks.get(groups[1].key)).toBe('北'); // 「国」「駅」ではなく区別しやすい文字
    expect(duplicateMarks(marks)).toEqual([]);
  });

  it('無印・同じ略号の重複を検出する', () => {
    expect(duplicateMarks(new Map([['a', ''], ['b', '']]))).toEqual(['']);
    expect(duplicateMarks(new Map([['a', ''], ['b', '市'], ['c', '市']]))).toEqual(['市']);
  });
});

describe('buildTimetable', () => {
  it('同じ出発内容の運行日を1つのパターンにまとめる', () => {
    const index = buildIndex(sampleGtfs());
    const { departures, groups } = analyzeStop(index, 'S1');
    const { patterns, issues } = buildTimetable(index, departures, groups, WEEK);

    const weekday = patterns.find((p) => p.dates.length === 5)!;
    expect(weekday.dates[0]).toBe('20261109');
    expect(weekday.departures.map((d) => d.tripId)).toEqual(['T1', 'T2']);
    expect(patterns.find((p) => p.dates[0] === '20261114')!.departures.map((d) => d.tripId)).toEqual(['T4']);
    expect(patterns.find((p) => p.dates[0] === '20261115')!.departures).toHaveLength(0); // 日曜は便なし

    expect(issues.filter((i) => i.level === 'stop')).toHaveLength(0);
    expect(issues.some((i) => i.message.includes('行先が不明'))).toBe(true);
  });

  it('頻度運行の便が含まれると出力停止にする', () => {
    const gtfs = sampleGtfs();
    gtfs.tables.frequencies = [{ trip_id: 'T1', start_time: '07:00:00', end_time: '08:00:00', headway_secs: '600' }];
    const index = buildIndex(gtfs);
    const { departures, groups } = analyzeStop(index, 'S1');
    const { issues } = buildTimetable(index, departures, groups, WEEK);
    expect(issues.some((i) => i.level === 'stop' && i.message.includes('頻度運行'))).toBe(true);
  });

  it('運行日データの範囲外を要確認にする', () => {
    const index = buildIndex(sampleGtfs());
    const { departures, groups } = analyzeStop(index, 'S1');
    const { issues } = buildTimetable(index, departures, groups, ['20261201']);
    expect(issues.some((i) => i.level === 'check' && i.message.includes('範囲'))).toBe(true);
  });
});

describe('groupByHour', () => {
  it('便のない時間帯も行として残す', () => {
    const index = buildIndex(sampleGtfs());
    const weekdayDeps = analyzeStop(index, 'S1').departures.filter((d) => d.serviceId === 'WEEKDAY');
    const rows = groupByHour(weekdayDeps);
    expect(rows[0].hour).toBe(7);
    expect(rows[rows.length - 1].hour).toBe(25);
    expect(rows.find((r) => r.hour === 8)!.departures).toHaveLength(0);
  });
});