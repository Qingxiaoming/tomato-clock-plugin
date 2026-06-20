const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 让 Metro 能够 watch 到 workspace 中共享包的源码变更
config.watchFolders = [path.resolve(workspaceRoot, 'packages')];

// 启用 symlink 支持，配合 npm workspace 使用
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
