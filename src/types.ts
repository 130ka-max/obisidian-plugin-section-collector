import { TFile } from 'obsidian';

// 検索モード
export type SearchMode = 'heading-only' | 'full-section';

// プラグイン設定
export interface SectionCollectorSettings {
    searchMode: SearchMode;
    lastKeyword: string;
    targetFolders: string[];  // 検索対象フォルダ（空配列=全て）
}

// デフォルト設定
export const DEFAULT_SETTINGS: SectionCollectorSettings = {
    searchMode: 'full-section',
    lastKeyword: '',
    targetFolders: []
};

// 検索結果
export interface SearchResult {
    file: TFile;              // ファイル情報
    heading: string;          // 見出しテキスト（#記号含む）
    headingLevel: number;     // 見出しレベル (1-6)
    content: string;          // セクション本文（見出し含む）
    lineStart: number;        // 開始行番号 (0-indexed)
    lineEnd: number;          // 終了行番号 (0-indexed)
    modifiedTime: number;     // ファイル更新日時
}

// パースされたセクション
export interface ParsedSection {
    heading: string;
    headingLevel: number;
    content: string;
    lineStart: number;
    lineEnd: number;
}
