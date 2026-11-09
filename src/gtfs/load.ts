// fflate の型宣言が提供されない環境でも実行時の依存は維持する。
// @ts-expect-error -- fflate の型宣言がプロジェクト側で解決できない場合があるため
import { unzipSync } from 'fflate';
// papaparse の型宣言が提供されない環境でも実行時の依存は維持する。
// @ts-expect-error -- papaparse の型宣言がプロジェクト側で解決できない場合があるため
import Papa from 'papaparse';
import type { Gtfs, Issue, Row } from './types';

/** 安全のための上限。超えたら読み込みを中断する（仕様書8章） */
export const LIMITS = { totalMB: 300, files: 100, rowsPerFile: 3_000_000 };

/** 時刻表作成に使うファイル。これらのCSV不正は「出力停止」とする */
const USED_FILES = ['agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar', 'calendar_dates', 'frequencies', 'feed_info'];

export async function loadGtfsZip(file: File) {
  return parseGtfsZip(new Uint8Array(await file.arrayBuffer()));
}

export function parseGtfsZip(zip: Uint8Array): { gtfs: Gtfs; issues: Issue[] } {
  const gtfs: Gtfs = { tables: {}, columns: {} };
  const issues: Issue[] = [];
  try {
    for (const [path, bytes] of Object.entries(unzipWithLimits(zip))) {
      readCsv(gtfs, issues, path, bytes as Uint8Array);
    }
    return { gtfs, issues };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    issues.push({
      level: 'stop',
      message: `GTFS ZIPを読み込めませんでした（${reason}）`,
      action: 'GTFS一式を含むZIPファイルか確認してください。',
    });
    return { gtfs: { tables: {}, columns: {} }, issues };
  }
}

function unzipWithLimits(zip: Uint8Array) {
  let fileCount = 0;
  let totalBytes = 0;
  return unzipSync(zip, {
    filter: (file: { name: string; originalSize: number }) => {
      const base = file.name.split('/').pop() ?? '';
      // .txt 以外と、macOSが付ける隠しファイル（__MACOSX, ._xxx.txt）は読まない
      if (!base.toLowerCase().endsWith('.txt') || base.startsWith('.') || file.name.includes('__MACOSX')) return false;
      fileCount += 1;
      totalBytes += file.originalSize;
      if (fileCount > LIMITS.files) throw new Error(`ファイル数が上限（${LIMITS.files}件）を超えています`);
      if (totalBytes > LIMITS.totalMB * 1024 * 1024) throw new Error(`展開後のサイズが上限（${LIMITS.totalMB}MB）を超えています`);
      return true;
    },
  });
}

function readCsv(gtfs: Gtfs, issues: Issue[], path: string, bytes: Uint8Array) {
  const name = (path.split('/').pop() ?? '').replace(/\.txt$/i, '');
  const level = USED_FILES.includes(name) ? 'stop' : 'check';

  if (gtfs.tables[name]) {
    issues.push({ level, message: `${name}.txt がZIP内に複数あります`, action: 'GTFS一式だけを含むZIPを選択してください。' });
    return;
  }

  const text = new TextDecoder('utf-8').decode(bytes); // 先頭のBOMは自動で除去される
  if (text.includes('\uFFFD')) {
    issues.push({ level, message: `${name}.txt にUTF-8として読めない文字があります`, action: '文字コードがUTF-8のGTFSを使用してください。' });
  }

  const result = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  });

  if (result.data.length > LIMITS.rowsPerFile) {
    throw new Error(`${name}.txt の行数が上限（${LIMITS.rowsPerFile.toLocaleString()}行）を超えています`);
  }
  if (result.errors.length > 0) {
    const line = (result.errors[0].row ?? 0) + 2; // ヘッダー行と0始まりの分を補正
    issues.push({
      level,
      message: `${name}.txt のCSV形式に誤りがあります（${result.errors.length}件。最初の誤り：${line}行目付近）`,
      action: '列数の不一致や引用符の閉じ忘れがないか、提供元に確認してください。',
    });
  }

  gtfs.tables[name] = result.data;
  gtfs.columns[name] = result.meta.fields ?? [];
}