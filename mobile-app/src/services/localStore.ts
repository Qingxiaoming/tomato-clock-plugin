import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalStore } from '../sync/types';

const DEVICE_ID_KEY = '@tomato_sync_device_id';
const SEQ_KEY = '@tomato_sync_seq';

/**
 * 基于 AsyncStorage 的本地存储实现
 *
 * deviceId 与 seq 计数器保存在手机本地，不同步到坚果云/WebDAV。
 */
export class AsyncStorageLocalStore implements LocalStore {
    async loadDeviceId(): Promise<string | null> {
        return await AsyncStorage.getItem(DEVICE_ID_KEY);
    }

    async saveDeviceId(id: string): Promise<void> {
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }

    async loadSeq(): Promise<number> {
        const raw = await AsyncStorage.getItem(SEQ_KEY);
        if (raw === null) return 0;
        const n = parseInt(raw, 10);
        return Number.isNaN(n) || n < 0 ? 0 : n;
    }

    async saveSeq(seq: number): Promise<void> {
        await AsyncStorage.setItem(SEQ_KEY, String(seq));
    }
}
