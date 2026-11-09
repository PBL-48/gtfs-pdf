const createElement = (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({
  $$typeof: Symbol.for('react.element'),
  type,
  key: props?.key ?? null,
  ref: null,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});
import { LEVEL_LABEL, type Issue, type IssueLevel } from '../gtfs/types';

const ORDER: Record<IssueLevel, number> = { stop: 0, check: 1, info: 2 };

/** 警告一覧。色だけでなく【出力停止】等の文字でも区別する */
export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return createElement('p', null, '警告はありません。');
  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return createElement(
    'ul',
    { className: 'issues' },
    sorted.map((issue, i) =>
      createElement(
        'li',
        { key: i, className: `issue ${issue.level}` },
        createElement('strong', null, `【${LEVEL_LABEL[issue.level]}】`),
        issue.message,
        issue.action && createElement('div', { className: 'action' }, `対応：${issue.action}`),
      ),
    ),
  );
}