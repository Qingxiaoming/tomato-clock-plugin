declare module 'webdav/react-native' {
    export interface WebDAVClient {
        createDirectory(path: string, options?: { recursive?: boolean }): Promise<void>;
        deleteFile(path: string): Promise<void>;
        getDirectoryContents(path: string): Promise<unknown>;
        getFileContents(path: string, options: { format: 'text' }): Promise<unknown>;
        putFileContents(path: string, content: string, options?: { overwrite?: boolean }): Promise<void>;
    }

    export type WebDAVAuthType = 'auto' | 'digest' | 'none' | 'password' | 'token';

    export function createClient(
        url: string,
        options: {
            username: string;
            password: string;
            authType?: WebDAVAuthType;
        },
    ): WebDAVClient;
}
