import { describe, expect, it } from 'vitest';
import { activeServices, buildServiceIndex } from '../src/gtfs/calendar';
import { addDays, formatDateRanges, isGtfsDate, weekday } from '../src/gtfs/dates';

describe('dates', () => {
  it('YYYYMMDDの妥当性を判定する', () => {
    expect(isGtfsDate('20261109')).toBe(true);
    expect(isGtfsDate('20260230')).toBe(false); // 存在しない日
    expect(isGtfsDate('2026-11-09')).toBe(false);
  });

  it('年をまたいで日付を加算できる', () => {
    expect(addDays('20261231', 1)).toBe('20270101');
  });

  it('曜日を求める（0=日曜）', () => {
    expect(weekday('20261109')).toBe(1); // 月曜
  });

  it('連続する日付をまとめて表示する', () => {
    expect(formatDateRanges(['20261109', '20261110', '20261111', '20261113'])).toBe(
      '2026/11/9(月)〜11/11(水)、2026/11/13(金)',
    );
    expect(formatDateRanges(['20261231', '20270101'])).toBe('2026/12/31(木)〜2027/1/1(金)');
  });
});

describe('activeServices', () => {
  const calendar = [
    {
      service_id: 'WEEKDAY',
      monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0',
      start_date: '20261101', end_date: '20261130',
    },
  ];
  const calendarDates = [
    { service_id: 'WEEKDAY', date: '20261123', exception_type: '2' }, // 祝日は平日ダイヤ運休
    { service_id: 'HOLIDAY', date: '20261123', exception_type: '1' }, // 祝日ダイヤを追加
  ];
  const index = buildServiceIndex(calendar, calendarDates);

  it('曜日と期間で基本の運行日を判定する', () => {
    expect([...activeServices(index, '20261109')]).toEqual(['WEEKDAY']);
    expect(activeServices(index, '20261108').size).toBe(0); // 日曜
    expect(activeServices(index, '20261201').size).toBe(0); // 期間外
  });

  it('calendar_dates の追加・運休を反映する', () => {
    expect([...activeServices(index, '20261123')]).toEqual(['HOLIDAY']);
  });

  it('運行日データの範囲を記録する', () => {
    expect(index.firstDate).toBe('20261101');
    expect(index.lastDate).toBe('20261130');
  });
});