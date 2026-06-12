import type TomatoPlugin from '../main';
import type { RecoveryData } from '../timer';

const RECOVERY_INTERVAL_MS = 10000;

export class RecoveryService {
    private timer: number | null = null;

    constructor(private plugin: TomatoPlugin) {}

    get recoveryPath(): string {
        return `${this.plugin.manifest.dir}/recovery.json`;
    }

    startAutoSave(): void {
        this.stopAutoSave();
        this.timer = window.setInterval(() => {
            void this.save();
        }, RECOVERY_INTERVAL_MS);
    }

    stopAutoSave(): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }

    async save(): Promise<void> {
        try {
            const data = this.plugin.timer.getRecoveryData();
            await this.plugin.app.vault.adapter.write(this.recoveryPath, JSON.stringify(data, null, 2));
        } catch {
            // Silently ignore write failures
        }
    }

    async load(): Promise<void> {
        try {
            const raw = await this.plugin.app.vault.adapter.read(this.recoveryPath);
            const data = JSON.parse(raw) as RecoveryData;
            if (data && typeof data.isRunning === 'boolean') {
                this.plugin.timer.restoreFromRecovery(data);
            }
        } catch {
            // No recovery file or parse error — fresh start
        }
    }
}
