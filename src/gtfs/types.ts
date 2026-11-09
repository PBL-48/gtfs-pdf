/** CSVの1行（列名 → 値） */
export type Row = Record<string, string>;

/** 読み込んだGTFS。キーはファイル名から .txt を除いたもの（例: "stop_times"） */
export type Gtfs = {
  tables: Record<string, Row[]>;
  columns: Record<string, string[]>;
};

/** 警告の区分（仕様書6章） */
export type IssueLevel = 'stop' | 'check' | 'info';

export type Issue = {
  level: IssueLevel;
  message: string;
  action?: string; // 対応方法
};

export const LEVEL_LABEL: Record<IssueLevel, string> = {
  stop: '出力停止',
  check: '要確認',
  info: '情報',
};