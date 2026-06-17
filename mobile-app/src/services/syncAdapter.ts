import { File, Directory } from 'expo-file-system';
import { createClient, type WebDAVClient } from 'webdav/react-native';

export interface SyncAdapter {
  read(): Promise<string>;
  write(content: string): Promise<void>;
}

export class LocalFileAdapter implements SyncAdapter {
  private file: File;

  constructor(uri: string) {
    this.file = new File(uri);
  }

  async read(): Promise<string> {
    return await this.file.text();
  }

  async write(content: string): Promise<void> {
    // Ensure parent directory exists
    const parentUri = this.file.uri.substring(0, this.file.uri.lastIndexOf('/'));
    if (parentUri) {
      const dir = new Directory(parentUri);
      try {
        await dir.create();
      } catch {
        // Directory may already exist
      }
    }
    await this.file.write(content);
  }
}

export class WebDAVAdapter implements SyncAdapter {
  private client: WebDAVClient;

  constructor(url: string, username: string, password: string, private filePath: string) {
    this.client = createClient(url, {
      username,
      password,
    });
  }

  async read(): Promise<string> {
    const content = await this.client.getFileContents(this.filePath, { format: 'text' });
    return content as string;
  }

  async write(content: string): Promise<void> {
    await this.client.putFileContents(this.filePath, content, { overwrite: true });
  }
}
