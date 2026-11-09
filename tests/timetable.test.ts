import { describe, expect, it } from 'vitest';
import { datesBetween } from '../src/gtfs/dates';
import { analyzeStop, assignSymbols, buildIndex, buildTimetable, groupByHour, parseTime } from '../src/gtfs/timetable';
import type { Gtfs } from '../src/gtfs/types';

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

  it('系統・方面を便数の多い順にまとめ、最多を無印にする', () => {
    const { groups } = analyzeStop(index, 'S1');
    expect(groups.map((g) => [g.headsign, g.count])).toEqual([['市役所', 2], ['', 1]]);
    const symbols = assignSymbols(groups);
    expect(symbols.get(groups[0].key)).toBe('');
    expect(symbols.get(groups[1].key)).toBe('●');
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