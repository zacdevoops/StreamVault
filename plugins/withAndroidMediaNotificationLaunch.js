const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = 'com.streamvault.app';
const TARGET = path.join(
  'node_modules',
  'expo-video',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'video',
  'playbackService',
  'ExpoVideoPlaybackService.kt',
);

const SESSION_ACTIVITY_MARKER = 'setSessionActivity(createMainActivityPendingIntent())';

function withAndroidMediaNotificationLaunch(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const filePath = path.join(modConfig.modRequest.projectRoot, TARGET);
      if (!fs.existsSync(filePath)) {
        return modConfig;
      }

      let contents = fs.readFileSync(filePath, 'utf8');
      contents = contents.replace(
        /Intent\.FLAG_ACTIVITY_SINGLE_TOP or Intent\.FLAG_ACTIVITY_CLEAR_TOP/g,
        'Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT',
      );
      if (contents.includes(SESSION_ACTIVITY_MARKER)) {
        fs.writeFileSync(filePath, contents);
        return modConfig;
      }

      if (!contents.includes('import android.app.PendingIntent')) {
        contents = contents.replace(
          'import android.app.NotificationManager',
          'import android.app.NotificationManager\nimport android.app.PendingIntent',
        );
      }

      contents = contents.replace(
        `.setCustomLayout(ImmutableList.of(seekBackwardButton, seekForwardButton))
        .build()`,
        `.setCustomLayout(ImmutableList.of(seekBackwardButton, seekForwardButton))
        .setSessionActivity(createMainActivityPendingIntent())
        .build()`,
      );

      contents = contents.replace(
        '  companion object {',
        `  private fun createMainActivityPendingIntent(): PendingIntent {
    val launchIntent = Intent(this, Class.forName("${PACKAGE_NAME}.MainActivity")).apply {
      action = Intent.ACTION_MAIN
      addCategory(Intent.CATEGORY_LAUNCHER)
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    }
    return PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {`,
      );

      fs.writeFileSync(filePath, contents);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidMediaNotificationLaunch;
