import { useMemo, useState } from 'react';
import { CHECK_ITEMS, Checklist } from './components/Checklist';
import { IssueList } from './components/IssueList';
import { StopPicker } from './components/StopPicker';
import { TimetableSheet, type SheetInfo } from './components/TimetableSheet';
import {
  addDays, datesBetween, dayCount, formatDate, formatDateRanges,
  gtfsToInput, inputToGtfs, isGtfsDate, todayIn,
} from './gtfs/dates';
import { loadGtfsZip } from './gtfs/load';
import { analyzeStop, buildIndex, buildTimetable, describeGroup } from './gtfs/timetable';
import { assignMarks } from './gtfs/marks';
import { guessPatternNames } from './gtfs/patternName';
import type { Gtfs, Issue } from './gtfs/types';
import { validateGtfs } from './gtfs/validate';

const MAX_DAYS = 400;
const DEFAULT_TZ = 'Asia/Tokyo';

type Loaded = { gtfs: Gtfs; issues: Issue[]; fileName: string; loadedAt: Date };
type Period = { start: string; end: string }; // YYYYMMDD

export default function App() {
  // ---- 入力・選択状態 ----
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [acquiredOn, setAcquiredOn] = useState(''); // 取得日（YYYY-MM-DD、任意）
  const [stopId, setStopId] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]); // 選択を外した系統・方面
  const [period, setPeriod] = useState<Period>({ start: '', end: '' });
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [patternNames, setPatternNames] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState({ key: '', items: [] as string[] });
  const [overflow, setOverflow] = useState<Record<string, boolean>>({});

  // ---- 派生データ ----
  const index = useMemo(() => (loaded ? buildIndex(loaded.gtfs) : null), [loaded]);
  const timezone = loaded?.gtfs.tables.agency?.[0]?.agency_timezone ?? '';
  const stop = index?.stops.get(stopId);
  const analysis = useMemo(() => (index && stopId ? analyzeStop(index, stopId) : null), [index, stopId]);
  const groups = useMemo(() => analysis?.groups.filter((g) => !excluded.includes(g.key)) ?? [], [analysis, excluded]);
  const marks = useMemo(() => assignMarks(groups), [groups]);
  const dates = useMemo(() => getPeriodDates(period), [period]);
  const result = useMemo(() => {
    if (!index || !analysis || !dates) return null;
    const keys = new Set(groups.map((g) => g.key));
    return buildTimetable(index, analysis.departures.filter((d) => keys.has(d.groupKey)), groups, dates);
  }, [index, analysis, groups, dates]);

  const patterns = result?.patterns.filter((p) => p.departures.length > 0) ?? [];
  const noServiceDates = result?.patterns.find((p) => p.departures.length === 0)?.dates ?? [];
  const autoNames = guessPatternNames(patterns, dates ?? []);
  const patternName = (key: string, i: number) => patternNames[key] ?? autoNames[i];

  // ---- 警告の集約 ----
  const issues: Issue[] = [...(loaded?.issues ?? []), ...(result?.issues ?? [])];
  if (loaded && !acquiredOn) issues.push({ level: 'info', message: '取得日が未入力のため「不明」と表示します。' });
  if (stop && !dates) {
    issues.push({ level: 'stop', message: `対象期間が正しくありません（開始日≦終了日、最大${MAX_DAYS}日）。`, action: '対象期間を指定し直してください。' });
  }
  if (patterns.some((p) => overflow[p.key])) {
    issues.push({
      level: 'stop',
      message: 'A4縦1ページに収まらない時刻表があります（プレビューの赤い破線）。自動での縮小・省略は行いません。',
      action: '注記を短くする、系統・方面や対象期間を分けて作成する等で調整してください。',
    });
  }
  const blocked = issues.some((i) => i.level === 'stop');

  // ---- 確認チェック：内容が変わったら自動で解除（4章） ----
  const contentKey = JSON.stringify([loaded?.fileName, loaded?.loadedAt.getTime(), acquiredOn, stopId, excluded, period, title, note, patternNames]);
  const checkedItems = checked.key === contentKey ? checked.items : [];
  const confirmed = CHECK_ITEMS.every((item) => checkedItems.includes(item));
  const canPrint = confirmed && !blocked && patterns.length > 0;

  // ---- 操作 ----
  async function handleFile(file: File) {
    setLoading(true);
    const { gtfs, issues: loadIssues } = await loadGtfsZip(file);
    if (Object.keys(gtfs.tables).length > 0) loadIssues.push(...validateGtfs(gtfs));
    const today = todayIn(gtfs.tables.agency?.[0]?.agency_timezone || DEFAULT_TZ);
    setLoaded({ gtfs, issues: loadIssues, fileName: file.name, loadedAt: new Date() });
    setPeriod({ start: today, end: addDays(today, 27) });
    setStopId('');
    setExcluded([]);
    setTitle('');
    setPatternNames({});
    setLoading(false);
  }

  function selectStop(id: string) {
    setStopId(id);
    setExcluded([]);
    setTitle('');
  }

  const toggleGroup = (key: string) =>
    setExcluded((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const toggleCheck = (item: string) =>
    setChecked({
      key: contentKey,
      items: checkedItems.includes(item) ? checkedItems.filter((i) => i !== item) : [...checkedItems, item],
    });

  // ---- 表示用ラベル ----
  const platform = stop?.platform_code ? `のりば ${stop.platform_code}` : '';
  const defaultTitle = stop ? stop.stop_name : '';
  const dataItems = loaded ? describeData(loaded, acquiredOn, timezone) : [];

  const sheetInfo: SheetInfo | null =
    stop && dates && loaded
      ? {
          title: title || defaultTitle,
          platform,
          periodLabel: `${formatDate(period.start)}〜${formatDate(period.end)}`,
          noServiceText: noServiceDates.length > 0 ? formatDateRanges(noServiceDates) : '',
          legend: groups.map((g) => ({ key: g.key, mark: marks.get(g.key) ?? '', label: describeGroup(g) })),
          marks,
          note,
          metaLabel: [
            `作成日：${formatDate(todayIn(timezone || DEFAULT_TZ))}`,
            `stop_id：${stop.stop_id}`,
            ...dataItems.filter(([label]) => label !== '読み込み日時').map(([label, value]) => `${label}：${value}`),
          ].join('　'),
          confirmed,
          blocked,
        }
      : null;

  return (
    <>
      <main className="app no-print">
        <h1>GTFSバス停時刻表作成ツール（MVP）</h1>
        <div className="notice">
          <p><strong>掲示前に、必ず担当者が最新の運行情報と照合してください。</strong>本ツールはGTFSの正確性や掲示物の利用可能性を保証しません。</p>
          <p>GTFSはこのブラウザ内で処理し、外部へ送信しません。作業内容は自動保存されず、ページを再読み込みすると消えます。印刷の検証対象はデスクトップ版Chromeです。</p>
        </div>

        <section className="step">
          <h2>1. GTFS ZIPの読み込み</h2>
          <label>
            GTFS ZIPファイル{' '}
            <input type="file" accept=".zip" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
          <label>
            取得日（任意）{' '}
            <input type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} />
          </label>
          {loading && <p role="status">読み込み中…（大きなデータでは時間がかかります）</p>}
          {dataItems.length > 0 && (
            <dl className="data-info">
              {dataItems.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
        </section>

        {loaded && (
          <section className="step" aria-live="polite">
            <h2>警告・確認事項</h2>
            <IssueList issues={issues} />
          </section>
        )}

        {index && (
          <section className="step">
            <h2>2. 停留所・乗り場</h2>
            <StopPicker stops={index.stops} selectedId={stopId} onSelect={selectStop} />
          </section>
        )}

        {analysis && (
          <section className="step">
            <h2>3. 系統・方面</h2>
            {analysis.groups.length === 0 ? (
              <p>この乗り場から乗車できる便はありません。</p>
            ) : (
              <ul className="plain">
                {analysis.groups.map((g) => (
                  <li key={g.key}>
                                        <label>
                      <input type="checkbox" checked={!excluded.includes(g.key)} onChange={() => toggleGroup(g.key)} />{' '}
                      {describeGroup(g)}／direction_id：{g.directionId || '未設定'}（GTFS全体で{g.count}回）
                      {marks.has(g.key) && <>　表示：{marks.get(g.key) || '無印'}</>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {stop && (
          <section className="step">
            <h2>4. 対象期間と運行パターン</h2>
            <label>
              開始日{' '}
              <input type="date" value={gtfsToInput(period.start)} onChange={(e) => setPeriod({ ...period, start: inputToGtfs(e.target.value) })} />
            </label>
            <label>
              終了日{' '}
              <input type="date" value={gtfsToInput(period.end)} onChange={(e) => setPeriod({ ...period, end: inputToGtfs(e.target.value) })} />
            </label>
            <p className="hint">表示名は適用日の曜日から自動で付けています（祝日は「平日なのに平日パターンでない日」として推定）。必要に応じて書き換えてください。書き換えても適用日は変わりません。</p>
            {patterns.length > 0 && (
              <table className="list">
                <thead>
                  <tr><th>表示名（編集可）</th><th>便数</th><th>適用日</th></tr>
                </thead>
                <tbody>
                  {patterns.map((p, i) => (
                    <tr key={p.key}>
                      <td>
                        <input
                          type="text"
                          aria-label={`運行パターン${i + 1}の表示名`}
                          value={patternName(p.key, i)}
                          onChange={(e) => setPatternNames({ ...patternNames, [p.key]: e.target.value })}
                        />
                      </td>
                      <td>{p.departures.length}</td>
                      <td>{formatDateRanges(p.dates)}（{p.dates.length}日）</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {noServiceDates.length > 0 && <p>この条件で便のない日：{formatDateRanges(noServiceDates)}</p>}
            <p className="hint">表示名は「平日」等に変更できますが、変更しても適用日は変わりません。適用日を確認してから名前を付けてください。</p>
          </section>
        )}

        {sheetInfo && (
          <>
            <section className="step">
              <h2>5. 表示内容の編集</h2>
              <label className="block">
                表題 <input type="text" value={title} placeholder={defaultTitle} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                補足注記（経由地・行先の補足など）
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </section>

            <section className="step">
              <h2>6. 確認</h2>
              <Checklist checkedItems={checkedItems} onToggle={toggleCheck} />
            </section>

            <section className="step">
              <h2>7. 印刷・PDF保存</h2>
              <button className="print" onClick={() => window.print()} disabled={!canPrint}>
                印刷・PDF保存
              </button>
              {!canPrint && (
                <ul>
                  {blocked && <li>「出力停止」の警告を解消してください（確認チェックでは解除されません）。</li>}
                  {!confirmed && <li>すべての確認項目にチェックしてください。</li>}
                  {patterns.length === 0 && <li>出力する時刻表がありません。</li>}
                </ul>
              )}
              <p className="hint">印刷画面で送信先を「PDFに保存」にするとPDFで保存できます。用紙はA4縦、余白は「なし」または「デフォルト」を選んでください。</p>
            </section>
          </>
        )}
      </main>

      {sheetInfo && (
        <section className="preview" aria-label="印刷プレビュー">
          <h2 className="no-print">プレビュー（{patterns.length}ページ）</h2>
          {patterns.map((p, i) => (
            <TimetableSheet
              key={p.key}
              pattern={p}
              name={patternName(p.key, i)}
              info={sheetInfo}
              overflow={!!overflow[p.key]}
              onOverflow={(value) => setOverflow((prev) => (prev[p.key] === value ? prev : { ...prev, [p.key]: value }))}
            />
          ))}
        </section>
      )}
    </>
  );
}

function getPeriodDates({ start, end }: Period): string[] | null {
  if (!isGtfsDate(start) || !isGtfsDate(end) || start > end) return null;
  if (dayCount(start, end) > MAX_DAYS) return null;
  return datesBetween(start, end);
}

/** データ識別情報（F-03）。ファイル名・読み込み日時・取得日・GTFS内の情報を区別して表示 */
function describeData(loaded: Loaded, acquiredOn: string, timezone: string): [string, string][] {
  const feed = loaded.gtfs.tables.feed_info?.[0];
  const fmt = (d?: string) => (d && isGtfsDate(d) ? formatDate(d) : '不明');
  const agencies = (loaded.gtfs.tables.agency ?? []).map((a) => a.agency_name).filter(Boolean).join('、');
  return [
    ['ファイル名', loaded.fileName],
    ['読み込み日時', loaded.loadedAt.toLocaleString('ja-JP')],
    ['取得日', acquiredOn ? formatDate(inputToGtfs(acquiredOn)) : '不明'],
    ['事業者', agencies || '不明'],
    ['データ提供者', feed?.feed_publisher_name || '不明'],
    ['データ版', feed?.feed_version || '不明'],
    ['データ有効期間', feed ? `${fmt(feed.feed_start_date)}〜${fmt(feed.feed_end_date)}` : '不明'],
    ['タイムゾーン', timezone || '不明'],
  ];
}