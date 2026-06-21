import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        typecheck: {
            tsconfig: './tsconfig.test.json',
        },
    },
    resolve: {
        alias: {
            obsidian: path.resolve(__dirname, './tests/mocks/obsidian.ts'),
        },
    },
});
