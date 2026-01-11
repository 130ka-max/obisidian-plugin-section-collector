import { Plugin } from 'obsidian';
import { SectionCollectorView, VIEW_TYPE_SECTION_COLLECTOR } from './src/SectionCollectorView';
import { SectionCollectorSettings, DEFAULT_SETTINGS } from './src/types';

export default class SectionCollectorPlugin extends Plugin {
    settings: SectionCollectorSettings;

    async onload(): Promise<void> {
        await this.loadSettings();

        // サイドパネルのビューを登録
        this.registerView(
            VIEW_TYPE_SECTION_COLLECTOR,
            (leaf) => new SectionCollectorView(leaf, this)
        );

        // リボンアイコンを追加
        this.addRibbonIcon('search', 'Section Collector', async () => {
            await this.activateView();
        });

        // コマンドを追加
        this.addCommand({
            id: 'open-section-collector',
            name: 'Open Section Collector',
            callback: async () => {
                await this.activateView();
            }
        });
    }

    async onunload(): Promise<void> {
        // ビューを閉じる
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_SECTION_COLLECTOR);
    }

    /**
     * サイドパネルを開く
     */
    async activateView(): Promise<void> {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_SECTION_COLLECTOR)[0];

        if (!leaf) {
            // 右サイドバーに新しいリーフを作成
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({
                    type: VIEW_TYPE_SECTION_COLLECTOR,
                    active: true
                });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
