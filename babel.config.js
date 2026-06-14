module.exports = function (api) {
  api.cache(true);
  const isProduction = process.env.NODE_ENV === 'production';
  const plugins = isProduction
    ? ['transform-remove-console', 'react-native-reanimated/plugin']
    : ['react-native-reanimated/plugin'];

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
