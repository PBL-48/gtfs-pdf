import type { RouteGroup } from './timetable';

const FALLBACK = ['●', '▲', '■', '◆', '★', '○', '△', '□'];
// 分の数字と混同しないよう、漢字・カタカナだけを略号に使う
const USABLE = /[\p{Script=Han}\p{Script=Katakana}]/u;

const clean = (s: string) => s.replace(/(行き|行|ゆき)$/, '').replace(/方面|循環|経由/g, '');

/** 系統・方面ごとの略号。最も便数の多いものを無印、ほかは行先・経由地の1文字（例：市役所行→「市」） */
export function assignMarks(groups: RouteGroup[]): Map<string, string> {
  const marks = new Map<string, string>();
  const used = new Set<string>();
  groups.forEach((g, i) => {
    if (i === 0) {
      marks.set(g.key, '');
      return;
    }
    const mark = candidates(g).find((c) => !used.has(c)) ?? FALLBACK.find((s) => !used.has(s)) ?? `※${i}`;
    used.add(mark);
    marks.set(g.key, mark);
  });
  return marks;
}

/** 略号の候補を優先順に並べる：循環の回り方 → 経由地 → 行先 → 終点 → 系統名 */
function candidates(g: RouteGroup): string[] {
  const [via, dest] = g.headsign.includes('経由') ? g.headsign.split('経由') : ['', g.headsign];
  const text = [g.via, via, dest, g.terminal, g.routeName].map((s) => clean(s ?? '')).join('');
  return [...text].filter((c) => USABLE.test(c));
}