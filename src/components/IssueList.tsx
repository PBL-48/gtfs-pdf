import { LEVEL_LABEL, type Issue, type IssueLevel } from '../gtfs/types';

const ORDER: Record<IssueLevel, number> = { stop: 0, check: 1, info: 2 };

/** 警告一覧。色だけでなく【出力停止】等の文字でも区別する */
export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return <p>警告はありません。</p>;
  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <ul className="issues">
      {sorted.map((issue, i) => (
        <li key={i} className={`issue ${issue.level}`}>
          <strong>【{LEVEL_LABEL[issue.level]}】</strong>
          {issue.message}
          {issue.action && <div className="action">対応：{issue.action}</div>}
        </li>
      ))}
    </ul>
  );
}