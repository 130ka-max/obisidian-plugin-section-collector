import { App, TFile } from 'obsidian';
import { SearchResult, ParsedSection, SearchMode } from './types';

export class SectionSearcher {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Vault内のすべてのMarkdownファイルからキーワードを含むセクションを検索
     */
    async search(keyword: string, mode: SearchMode, targetFolders: string[] = []): Promise<SearchResult[]> {
        if (!keyword.trim()) {
            return [];
        }

        let files = this.app.vault.getMarkdownFiles();

        // フォルダフィルター（指定がある場合）
        if (targetFolders.length > 0) {
            files = files.filter(file => {
                return targetFolders.some(folder => {
                    // フォルダパスで始まるかチェック（サブフォルダを含む）
                    return file.path.startsWith(folder + '/') || file.path.startsWith(folder);
                });
            });
        }

        const results: SearchResult[] = [];
        const lowerKeyword = keyword.toLowerCase();

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const sections = this.parseSections(content);

            for (const section of sections) {
                const isMatch = this.matchesKeyword(section, lowerKeyword, mode);
                if (isMatch) {
                    results.push({
                        file,
                        heading: section.heading,
                        headingLevel: section.headingLevel,
                        content: section.content,
                        lineStart: section.lineStart,
                        lineEnd: section.lineEnd,
                        modifiedTime: file.stat.mtime
                    });
                }
            }
        }

        // 更新日時順（新しい順）でソート
        results.sort((a, b) => b.modifiedTime - a.modifiedTime);

        return results;
    }

    /**
     * Markdownファイルの内容をセクションに分割
     */
    private parseSections(content: string): ParsedSection[] {
        const lines = content.split('\n');
        const sections: ParsedSection[] = [];

        let currentSection: ParsedSection | null = null;
        const headingRegex = /^(#{1,6})\s+(.+)$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(headingRegex);

            if (match) {
                // 前のセクションを確定
                if (currentSection) {
                    currentSection.lineEnd = i - 1;
                    currentSection.content = lines
                        .slice(currentSection.lineStart, i)
                        .join('\n');
                    sections.push(currentSection);
                }

                // 新しいセクションを開始
                currentSection = {
                    heading: line,
                    headingLevel: match[1].length,
                    content: '',
                    lineStart: i,
                    lineEnd: i
                };
            }
        }

        // 最後のセクションを確定
        if (currentSection) {
            currentSection.lineEnd = lines.length - 1;
            currentSection.content = lines
                .slice(currentSection.lineStart)
                .join('\n');
            sections.push(currentSection);
        }

        return sections;
    }

    /**
     * セクションがキーワードにマッチするかチェック
     */
    private matchesKeyword(
        section: ParsedSection,
        lowerKeyword: string,
        mode: SearchMode
    ): boolean {
        if (mode === 'heading-only') {
            // 見出しテキストのみを検索
            return section.heading.toLowerCase().includes(lowerKeyword);
        } else {
            // セクション全体（見出し + 本文）を検索
            return section.content.toLowerCase().includes(lowerKeyword);
        }
    }
}
