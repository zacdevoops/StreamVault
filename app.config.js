/** @type {import('expo/config').ExpoConfig} */
module.exports = () => {
  const appJson = require('./app.json');
  const expo = { ...appJson.expo };

  const plugins = (expo.plugins ?? []).filter((plugin) => {
    if (plugin === 'react-native-google-mobile-ads') return false;
    if (Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads') return false;
    return true;
  });

  plugins.push([
    'react-native-google-mobile-ads',
    {
      androidAppId:
        process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID
        ?? 'ca-app-pub-3940256099942544~3347511713',
      iosAppId:
        process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID
        ?? 'ca-app-pub-3940256099942544~3347511713',
    },
  ]);
  plugins.push('./plugins/withAdMobMetaMediation.js');

  return {
    ...expo,
    plugins,
  };
};
