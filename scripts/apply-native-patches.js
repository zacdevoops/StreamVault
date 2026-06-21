#!/usr/bin/env node
const path = require('path');
const { applyExpoVideoPiPPatches } = require('../plugins/withAndroidVideoPiPExitFix');

const projectRoot = path.join(__dirname, '..');
const applied = applyExpoVideoPiPPatches(projectRoot);

if (applied) {
  console.log('[apply-native-patches] Applied expo-video PiP exit patches.');
  console.log(
    '[apply-native-patches] Ensure package.json sets expo.autolinking.android.buildFromSource to ["expo-video"].',
  );
} else {
  console.warn('[apply-native-patches] expo-video not found; skipped PiP patch.');
}
