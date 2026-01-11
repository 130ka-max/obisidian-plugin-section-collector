import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type SectionCollectorPlugin from '../main';
import { SearchResult, SearchMode } from './types';
import { SectionSearcher } from './SectionSearcher';

export const VIEW_TYPE_SECTION_COLLECTOR = 'section-collector-view';

export class SectionCollectorView extends ItemView {
    private plugin: SectionCollectorPlugin;
    private searcher: SectionSearcher;
    private searchInput: HTMLInputElement;
    private resultsContainer: HTMLElement;
    private resultCountEl: HTMLElement;
    private currentResults: SearchResult[] = [];
    private currentKeyword: string = '';
    private selectedIndices: Set<number> = new Set();
    private selectAllContainer: HTMLElement;
    private folderTagsContainer: HTMLElement;
    private selectedFolders: string[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: SectionCollectorPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.searcher = new SectionSearcher(this.app);
    }

    getViewType(): string {
        return VIEW_TYPE_SECTION_COLLECTOR;
    }

    getDisplayText(): string {
        return 'Section Collector';
    }

    getIcon(): string {
        return 'search';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('section-collector-container');

        // ヘッダー
        const header = container.createDiv({ cls: 'section-collector-header' });
        header.createEl('h4', { text: '🔍 Section Collector' });

        // 検索入力欄
        const searchContainer = container.createDiv({ cls: 'section-collector-search' });
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'キーワードを入力...',
            cls: 'section-collector-input'
        });
        this.searchInput.value = this.plugin.settings.lastKeyword;

        // Enterキーで検索
        this.searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                await this.performSearch();
            }
        });

        // フォルダ選択UI
        const folderContainer = container.createDiv({ cls: 'section-collector-folder-container' });

        // フォルダ選択ドロップダウン
        const folderSelect = folderContainer.createEl('select', {
            cls: 'section-collector-folder-select'
        });
        const defaultOption = folderSelect.createEl('option', {
            text: '📁 フォルダを追加...',
            value: ''
        });

        // Vault内のフォルダ一覧を取得
        this.populateFolderOptions(folderSelect);

        folderSelect.addEventListener('change', () => {
            const selectedFolder = folderSelect.value;
            if (selectedFolder && !this.selectedFolders.includes(selectedFolder)) {
                this.selectedFolders.push(selectedFolder);
                this.plugin.settings.targetFolders = [...this.selectedFolders];
                this.plugin.saveSettings();
                this.renderFolderTags();
            }
            folderSelect.value = ''; // リセット
        });

        // 選択されたフォルダのタグ表示エリア
        this.folderTagsContainer = folderContainer.createDiv({ cls: 'section-collector-folder-tags' });

        // 保存された設定を復元
        this.selectedFolders = [...this.plugin.settings.targetFolders];
        this.renderFolderTags();

        // 検索モードトグル
        const modeContainer = container.createDiv({ cls: 'section-collector-mode' });

        const headingOnlyLabel = modeContainer.createEl('label', { cls: 'section-collector-mode-label' });
        const headingOnlyRadio = headingOnlyLabel.createEl('input', {
            type: 'radio',
            attr: { name: 'search-mode', value: 'heading-only' }
        });
        headingOnlyLabel.appendText(' 見出しのみ');

        const fullSectionLabel = modeContainer.createEl('label', { cls: 'section-collector-mode-label' });
        const fullSectionRadio = fullSectionLabel.createEl('input', {
            type: 'radio',
            attr: { name: 'search-mode', value: 'full-section' }
        });
        fullSectionLabel.appendText(' セクション全体');

        // 現在のモードを反映
        if (this.plugin.settings.searchMode === 'heading-only') {
            headingOnlyRadio.checked = true;
        } else {
            fullSectionRadio.checked = true;
        }

        // モード変更時の処理
        headingOnlyRadio.addEventListener('change', () => {
            this.plugin.settings.searchMode = 'heading-only';
            this.plugin.saveSettings();
        });
        fullSectionRadio.addEventListener('change', () => {
            this.plugin.settings.searchMode = 'full-section';
            this.plugin.saveSettings();
        });

        // 結果カウントとボタン
        const countContainer = container.createDiv({ cls: 'section-collector-count-container' });
        this.resultCountEl = countContainer.createDiv({ cls: 'section-collector-count' });

        // ボタンコンテナ（右揃え用）
        const buttonsContainer = countContainer.createDiv({ cls: 'section-collector-buttons' });

        // エクスポートボタン
        const exportBtn = buttonsContainer.createEl('button', {
            text: '📥 エクスポート',
            cls: 'section-collector-export-btn'
        });
        exportBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.exportResults();
        });

        // クリアボタン
        const clearBtn = buttonsContainer.createEl('button', {
            text: '🗑️ クリア',
            cls: 'section-collector-clear-btn'
        });
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearResults();
        });
        // 全選択/解除コンテナ
        this.selectAllContainer = container.createDiv({ cls: 'section-collector-select-all-container' });
        this.selectAllContainer.style.display = 'none'; // 初期は非表示

        const selectAllCheckbox = this.selectAllContainer.createEl('input', {
            type: 'checkbox',
            cls: 'section-collector-select-all-checkbox'
        });
        const selectAllLabel = this.selectAllContainer.createEl('label', {
            text: ' 全選択/解除',
            cls: 'section-collector-select-all-label'
        });

        selectAllCheckbox.addEventListener('change', () => {
            if (selectAllCheckbox.checked) {
                // 全選択
                this.currentResults.forEach((_, index) => this.selectedIndices.add(index));
            } else {
                // 全解除
                this.selectedIndices.clear();
            }
            this.updateSelectionUI();
        });

        // 結果コンテナ
        this.resultsContainer = container.createDiv({ cls: 'section-collector-results' });

        // 前回のキーワードがあれば検索実行
        if (this.plugin.settings.lastKeyword) {
            await this.performSearch();
        }
    }

    async onClose(): Promise<void> {
        // クリーンアップ
    }

    /**
     * フォルダ選択ドロップダウンにオプションを追加
     */
    private populateFolderOptions(selectEl: HTMLSelectElement): void {
        const folders = new Set<string>();

        // すべてのファイルからフォルダパスを抽出
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            const parts = file.path.split('/');
            if (parts.length > 1) {
                // ファイル名を除いたフォルダパスを追加
                let folderPath = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    folderPath = folderPath ? `${folderPath}/${parts[i]}` : parts[i];
                    folders.add(folderPath);
                }
            }
        }

        // ソートしてオプションを追加
        const sortedFolders = Array.from(folders).sort();
        for (const folder of sortedFolders) {
            selectEl.createEl('option', {
                text: folder,
                value: folder
            });
        }
    }

    /**
     * 選択されたフォルダのタグを描画
     */
    private renderFolderTags(): void {
        this.folderTagsContainer.empty();

        for (const folder of this.selectedFolders) {
            const tag = this.folderTagsContainer.createDiv({ cls: 'section-collector-folder-tag' });
            tag.createSpan({ text: folder });

            // 削除ボタン
            const removeBtn = tag.createSpan({
                text: '✕',
                cls: 'section-collector-folder-tag-remove'
            });
            removeBtn.addEventListener('click', () => {
                this.selectedFolders = this.selectedFolders.filter(f => f !== folder);
                this.plugin.settings.targetFolders = [...this.selectedFolders];
                this.plugin.saveSettings();
                this.renderFolderTags();
            });
        }
    }

    /**
     * 検索を実行
     */
    private async performSearch(): Promise<void> {
        const keyword = this.searchInput.value.trim();
        if (!keyword) {
            this.resultCountEl.setText('');
            this.resultsContainer.empty();
            return;
        }

        // キーワードを保存
        this.plugin.settings.lastKeyword = keyword;
        await this.plugin.saveSettings();

        // 検索実行
        this.resultCountEl.setText('検索中...');
        this.currentKeyword = keyword;
        this.currentResults = await this.searcher.search(keyword, this.plugin.settings.searchMode, this.selectedFolders);

        // 結果を表示
        this.renderResults();
    }

    /**
     * 検索結果をクリア
     */
    private clearResults(): void {
        this.searchInput.value = '';
        this.currentKeyword = '';
        this.currentResults = [];
        this.selectedIndices.clear();
        this.selectedFolders = [];
        this.resultCountEl.setText('');
        this.resultsContainer.empty();
        this.selectAllContainer.style.display = 'none';
        this.renderFolderTags();

        // 保存された設定もクリア
        this.plugin.settings.lastKeyword = '';
        this.plugin.settings.targetFolders = [];
        this.plugin.saveSettings();
    }

    /**
     * 検索結果を描画
     */
    private renderResults(): void {
        this.resultsContainer.empty();
        this.selectedIndices.clear(); // 検索時に選択をリセット
        this.updateResultCount();

        if (this.currentResults.length === 0) {
            this.selectAllContainer.style.display = 'none';
            this.resultsContainer.createDiv({
                text: '該当するセクションが見つかりませんでした',
                cls: 'section-collector-no-results'
            });
            return;
        }

        // 全選択コンテナを表示
        this.selectAllContainer.style.display = 'flex';
        const selectAllCheckbox = this.selectAllContainer.querySelector('input') as HTMLInputElement;
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }

        for (let index = 0; index < this.currentResults.length; index++) {
            const result = this.currentResults[index];
            const resultItem = this.resultsContainer.createDiv({ cls: 'section-collector-result-item' });

            // チェックボックス付きファイルヘッダー
            const fileHeader = resultItem.createDiv({ cls: 'section-collector-file-header' });

            // チェックボックス
            const checkbox = fileHeader.createEl('input', {
                type: 'checkbox',
                cls: 'section-collector-item-checkbox'
            });
            checkbox.dataset.index = String(index);
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation(); // クリックイベントの伝播を停止
            });
            checkbox.addEventListener('change', () => {
                const idx = parseInt(checkbox.dataset.index || '0');
                if (checkbox.checked) {
                    this.selectedIndices.add(idx);
                } else {
                    this.selectedIndices.delete(idx);
                }
                this.updateResultCount();
            });

            const fileIcon = fileHeader.createSpan({ cls: 'section-collector-file-icon' });
            setIcon(fileIcon, 'file-text');
            fileHeader.createSpan({ text: result.file.path, cls: 'section-collector-file-path' });

            // セクション内容
            const sectionContent = resultItem.createDiv({ cls: 'section-collector-section-content' });

            // 見出し（ハイライト付き）
            const headingEl = sectionContent.createDiv({ cls: 'section-collector-heading' });
            headingEl.innerHTML = this.highlightKeyword(result.heading, this.currentKeyword);

            // 本文（見出し行を除いた部分、ハイライト付き）
            const contentLines = result.content.split('\n');
            const bodyLines = contentLines.slice(1).join('\n').trim();
            if (bodyLines) {
                const bodyEl = sectionContent.createDiv({ cls: 'section-collector-body' });
                bodyEl.innerHTML = this.highlightKeyword(bodyLines, this.currentKeyword);
            }

            // クリックでファイルを開く
            resultItem.addEventListener('click', async () => {
                // 新しいタブで開く
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(result.file);

                // 該当行にスクロール
                const view = leaf.view;
                if (view.getViewType() === 'markdown') {
                    // エディタを取得してスクロール
                    const editor = (view as any).editor;
                    if (editor) {
                        editor.setCursor({ line: result.lineStart, ch: 0 });
                        editor.scrollIntoView({ from: { line: result.lineStart, ch: 0 }, to: { line: result.lineStart, ch: 0 } }, true);
                    }
                }
            });
        }
    }

    /**
     * 結果カウントを更新（選択件数を含む）
     */
    private updateResultCount(): void {
        if (this.currentResults.length === 0) {
            this.resultCountEl.setText('');
        } else if (this.selectedIndices.size > 0) {
            this.resultCountEl.setText(`📊 ${this.currentResults.length}件の結果 (${this.selectedIndices.size}件選択中)`);
        } else {
            this.resultCountEl.setText(`📊 ${this.currentResults.length}件の結果`);
        }
    }

    /**
     * 選択UIを更新
     */
    private updateSelectionUI(): void {
        // チェックボックスの状態を更新
        const checkboxes = this.resultsContainer.querySelectorAll('.section-collector-item-checkbox') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach((checkbox) => {
            const index = parseInt(checkbox.dataset.index || '0');
            checkbox.checked = this.selectedIndices.has(index);
        });
        this.updateResultCount();
    }

    /**
     * キーワードをハイライト表示
     */
    private highlightKeyword(text: string, keyword: string): string {
        if (!keyword) return this.escapeHtml(text);

        const escapedText = this.escapeHtml(text);
        const escapedKeyword = this.escapeHtml(keyword);
        const regex = new RegExp(`(${this.escapeRegex(escapedKeyword)})`, 'gi');

        return escapedText.replace(regex, '<mark class="section-collector-highlight">$1</mark>');
    }

    /**
     * HTML特殊文字をエスケープ
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 正規表現の特殊文字をエスケープ
     */
    private escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * キーワードをMarkdown形式でハイライト（==keyword==）
     */
    private highlightKeywordForMarkdown(text: string, keyword: string): string {
        if (!keyword) return text;

        const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
        return text.replace(regex, '==$1==');
    }

    /**
     * 検索結果をMDファイルにエクスポート
     */
    private async exportResults(): Promise<void> {
        if (this.currentResults.length === 0) {
            new Notice('エクスポートする結果がありません');
            return;
        }

        // 選択されている結果を取得（選択がなければ全て）
        const resultsToExport = this.selectedIndices.size > 0
            ? this.currentResults.filter((_, index) => this.selectedIndices.has(index))
            : this.currentResults;

        const keyword = this.currentKeyword || this.plugin.settings.lastKeyword;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

        // ファイル名: キーワード_日時.md
        const safeKeyword = keyword.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${safeKeyword}_${dateStr}_${timeStr}.md`;

        // Markdownコンテンツを作成
        const lines: string[] = [];
        lines.push(`# 検索結果: ${keyword}`);
        lines.push('');
        lines.push(`- **検索日時**: ${now.toLocaleString('ja-JP')}`);
        lines.push(`- **検索モード**: ${this.plugin.settings.searchMode === 'heading-only' ? '見出しのみ' : 'セクション全体'}`);
        lines.push(`- **結果件数**: ${resultsToExport.length}件${this.selectedIndices.size > 0 ? ' (選択)' : ''}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        for (const result of resultsToExport) {
            // ファイルへのリンク（見出しではなく通常テキスト）
            const filePath = result.file.path.replace('.md', '');
            lines.push(`📄 [[${filePath}]]`);
            lines.push('');
            // キーワードをハイライト形式に変換（==keyword==）
            const highlightedContent = this.highlightKeywordForMarkdown(result.content, keyword);
            lines.push(highlightedContent);
            lines.push('');
            lines.push('---');
            lines.push('');
        }

        const content = lines.join('\n');

        // Vaultルートにファイルを作成
        try {
            await this.app.vault.create(fileName, content);
            new Notice(`エクスポート完了: ${fileName}`);
        } catch (error) {
            // ファイルが既に存在する場合
            if ((error as any).message?.includes('already exists')) {
                new Notice(`ファイルが既に存在します: ${fileName}`);
            } else {
                new Notice(`エクスポートエラー: ${(error as any).message}`);
            }
        }
    }
}
