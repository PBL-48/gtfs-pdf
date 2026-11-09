import type { RouteGroup } from './timetable';

const FALLBACK = ['●', '▲', '■', '◆', '★', '○', '△', '□'];
// 分の数字と混同しないよう、漢字・カタカナだけを略号に使う
const USABLE = /[\p{Script=Han}\p{Script=Katakana}]/u;
// 多くの停留所名に含まれ、区別に向かない文字は後回しにする
const GENERIC = /[駅口前]/;

const clean = (s: string) => s.replace(/(行き|行|ゆき)$/, '').replace(/方面|循環|経由/g, '');
const charsOf = (texts: string[]) => [...texts.map(clean).join('')].filter((c) => USABLE.test(c));

/**
 * 系統・方面ごとの略号。最も便数の多いものを無印、ほかは行先等の1文字。
 * 無印の系統を特徴づける文字（例：「国立市役所方面」の「国」「市」）はなるべく避ける。
 */
export function assignMarks(groups: RouteGroup[]): Map<string, string> {
  const marks = new Map<string, string>();
  const used = new Set<string>();
  const mainChars = new Set(groups.length > 0 ? charsOf(fieldsOf(groups[0], groups).main) : []);

  groups.forEach((g, i) => {
    if (i === 0) {
      marks.set(g.key, '');
      return;
    }
    const { main, rest, route } = fieldsOf(g, groups);
    const places = charsOf([...main, ...rest]).filter((c) => !used.has(c));
    const mark =
      places.find((c) => !mainChars.has(c) && !GENERIC.test(c)) ??
      places.find((c) => !mainChars.has(c)) ??
      places[0] ??
      charsOf([route]).find((c) => !used.has(c)) ??
      FALLBACK.find((s) => !used.has(s)) ??
      `※${i}`;
    used.add(mark);
    marks.set(g.key, mark);
  });
  return marks;
}

/** 略号の候補となる文字列。行先表示が他と同じなら、先の主な停留所・次の停留所を優先する */
function fieldsOf(g: RouteGroup, groups: RouteGroup[]) {
  const shared = groups.some((o) => o.key !== g.key && o.headsign === g.headsign);
  const [via, dest] = g.headsign.includes('経由') ? g.headsign.split('経由') : ['', g.headsign];
  return shared
    ? { main: [g.toward, g.next], rest: [g.terminal, via, dest], route: g.routeName }
    : { main: [via, dest], rest: [g.terminal, g.next], route: g.routeName };
}

/** 2つ以上の系統・方面に付いている略号（無印は ''） */
export function duplicateMarks(marks: Map<string, string>): string[] {
  const count = new Map<string, number>();
  for (const m of marks.values()) count.set(m, (count.get(m) ?? 0) + 1);
  return [...count].filter(([, n]) => n > 1).map(([m]) => m);
}