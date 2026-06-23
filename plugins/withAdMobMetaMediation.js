const { withAppBuildGradle } = require('@expo/config-plugins');

const META_ADAPTER = "implementation 'com.google.ads.mediation:facebook:6.20.0.0'";

function withAdMobMetaMediation(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.contents.includes('com.google.ads.mediation:facebook')) {
      return modConfig;
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {
    // Meta Audience Network adapter for AdMob mediation (Android only).
    ${META_ADAPTER}`,
    );

    return modConfig;
  });
}

module.exports = withAdMobMetaMediation;
