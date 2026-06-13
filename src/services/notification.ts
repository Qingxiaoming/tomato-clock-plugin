import type TomatoPlugin from '../main';

export class NotificationService {
    constructor(private plugin: TomatoPlugin) {}

    send(title: string, body: string): void {
        if (!this.plugin.settings.enableOsNotification) return;
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        new Notification(title, { body, silent: true });
    }

    beep(): void {
        if (!this.plugin.settings.enableSound) return;
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch {
            // AudioContext unavailable — silently skip
        }
    }

}
