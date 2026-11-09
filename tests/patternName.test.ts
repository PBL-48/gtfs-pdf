import { describe, expect, it } from 'vitest';
import { datesBetween } from '../src/gtfs/dates';
import { guessPatternNames } from '../src/gtfs/patternName';
import type { Pattern } from '../src/gtfs/timetable';

const pattern = (dates: string[]): Pattern => ({ key: dates.join(), dates, departures: [] });

describe('guessPatternNames', () => {
  const period = datesBetween('20261116', '20261129'); // 2週間。11/23(月)は祝日
  const weekdays = ['20261116', '20261117', '20261118', '20261119', '20261120',
    '20261124', '20261125', '20261126', '20261127'];

  it('平日・土曜・日曜祝日を判定する', () => {
    const names = guessPatternNames(
      [pattern(weekdays), pattern(['20261121', '20261128']), pattern(['20261122', '20261123', '20261129'])],
      period,
    );
    expect(names).toEqual(['平日', '土曜', '日曜・祝日']);
  });

  it('土日祝・特定日・重複を判定する', () => {
    const names = guessPatternNames(
      [pattern(['20261121', '20261122', '20261123', '20261128', '20261129']), pattern(['20261120'])],
      period,
    );
    expect(names).toEqual(['土日祝', '特定日']);
    expect(guessPatternNames([pattern(['20261116']), pattern(['20261117'])], period)).toEqual(['特定日（1）', '特定日（2）']);
  });
});