const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');
config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, 'ts', 'tsx', 'cjs', 'mjs'])
);

config.transformer = {
  ...config.transformer,
  async getTransformOptions() {
    return {
      transform: {
        // Expo's serializer already includes its tree-shake pass; static import
        // support gives Metro better module boundaries to prune in production.
        experimentalImportSupport: true,
        inlineRequires: true,
      },
    };
  },
  minifierConfig: {
    ...config.transformer.minifierConfig,
    compress: {
      ...config.transformer.minifierConfig?.compress,
      dead_code: true,
      unused: true,
      passes: 2,
    },
  },
};

module.exports = config;
