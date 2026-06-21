const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const VIDEO_VIEW_TARGET = path.join(
  'node_modules',
  'expo-video',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'video',
  'VideoView.kt',
);

const PIP_FRAGMENT_TARGET = path.join(
  'node_modules',
  'expo-video',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'video',
  'PictureInPictureHelperFragment.kt',
);

const PATCH_MARKER = '// StreamVault PiP exit guard';

const PATCHED_ENTER = `  fun layoutForPiPEnter() {
    playerView.useController = false
    if (playerView.parent === rootView) {
      isPiPLayoutActive = true
      pendingPiPRecover = false
      return
    }
    isPiPLayoutActive = true
    pendingPiPRecover = false
    rootViewChildrenOriginalVisibility.clear()
    (playerView.parent as? ViewGroup)?.removeView(playerView)
    for (i in 0 until rootView.childCount) {
      val child = rootView.getChildAt(i)
      if (child !== playerView) {
        rootViewChildrenOriginalVisibility.add(child.visibility)
        child.visibility = View.GONE
      }
    }
    rootView.addView(
      playerView,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
  }`;

const PATCHED_HELPERS_AND_EXIT = `  fun layoutForPiPExit() {
    ${PATCH_MARKER}
    try {
      playerView.useController = useNativeControls
      detachPlayerViewFromActivityRoot()
      restoreActivityRootVisibility()
      rootViewChildrenOriginalVisibility.clear()

      if (isAttachedToWindow) {
        restorePlayerViewAfterPiP()
        pendingPiPRecover = false
      } else {
        pendingPiPRecover = true
      }
    } catch (_: Exception) {
      recoverFromPiPLayoutFailure()
    } finally {
      isPiPLayoutActive = false
    }
  }

  internal fun recoverFromPiPLayoutFailure() {
    rootViewChildrenOriginalVisibility.clear()
    detachPlayerViewFromActivityRoot()
    playerView.useController = useNativeControls
    restoreActivityRootVisibility()
    if (isAttachedToWindow) {
      restorePlayerViewAfterPiP()
      pendingPiPRecover = false
    } else {
      pendingPiPRecover = true
    }
  }

  private fun needsPiPRecovery(): Boolean {
    return pendingPiPRecover ||
      isPiPLayoutActive ||
      playerView.parent === rootView ||
      playerView.parent !== this
  }

  private fun detachPlayerViewFromActivityRoot() {
    if (playerView.parent === rootView) {
      rootView.removeView(playerView)
    }
  }

  private fun restoreActivityRootVisibility() {
    for (i in 0 until rootView.childCount) {
      rootView.getChildAt(i).visibility = View.VISIBLE
    }
  }

  private fun restorePlayerViewAfterPiP() {
    val parent = playerView.parent as? ViewGroup
    if (parent != null && parent !== this) {
      try {
        parent.removeView(playerView)
      } catch (_: Exception) {
      }
    }

    if (playerView.parent !== this) {
      try {
        addView(
          playerView,
          ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
          ),
        )
      } catch (_: Exception) {
      }
    }

    attachPlayer()
    requestLayout()
  }`;

const PATCHED_FRAGMENT = `package expo.modules.video

import androidx.fragment.app.Fragment
import java.util.UUID

class PictureInPictureHelperFragment(private val videoView: VideoView) : Fragment() {
  val id = "\${PictureInPictureHelperFragment::class.java.simpleName}_\${UUID.randomUUID()}"

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode)

    if (isInPictureInPictureMode) {
      if (videoView.wasAutoPaused) {
        videoView.playerView.player?.play()
      }
      videoView.layoutForPiPEnter()
      videoView.onPictureInPictureStart(Unit)
    } else {
      videoView.willEnterPiP = false
      videoView.onPictureInPictureStop(Unit)
      videoView.post {
        try {
          videoView.layoutForPiPExit()
        } catch (_: Exception) {
          videoView.recoverFromPiPLayoutFailure()
        }
      }
    }
  }
}
`;

function addPiPLayoutFlags(contents) {
  let next = contents;
  if (!next.includes('isPiPLayoutActive')) {
    next = next.replace(
      '  var willEnterPiP: Boolean = false\n',
      '  var willEnterPiP: Boolean = false\n  private var isPiPLayoutActive: Boolean = false\n  private var pendingPiPRecover: Boolean = false\n',
    );
  } else if (!next.includes('pendingPiPRecover')) {
    next = next.replace(
      '  private var isPiPLayoutActive: Boolean = false\n',
      '  private var isPiPLayoutActive: Boolean = false\n  private var pendingPiPRecover: Boolean = false\n',
    );
  }
  return next;
}

function replacePiPEnter(contents) {
  const start = contents.indexOf('  fun layoutForPiPEnter()');
  const end = contents.indexOf('  fun layoutForPiPExit()', start);
  if (start === -1 || end === -1) {
    throw new Error('Failed to locate layoutForPiPEnter block in VideoView.kt');
  }
  return `${contents.slice(0, start)}${PATCHED_ENTER}\n\n${contents.slice(end)}`;
}

function replacePiPExitBlock(contents) {
  const start = contents.indexOf('  fun layoutForPiPExit()');
  const end = contents.indexOf('  override fun onVideoSourceLoaded', start);
  if (start === -1 || end === -1) {
    throw new Error('Failed to locate layoutForPiPExit block in VideoView.kt');
  }
  return `${contents.slice(0, start)}${PATCHED_HELPERS_AND_EXIT}\n\n${contents.slice(end)}`;
}

function patchOnAttachedToWindow(contents) {
  const marker = '// StreamVault PiP reattach on mount';
  const replacement = `  override fun onAttachedToWindow() {
    ${marker}
    if (needsPiPRecovery()) {
      recoverFromPiPLayoutFailure()
      isPiPLayoutActive = false
    }
    super.onAttachedToWindow()`;

  if (contents.includes(marker)) {
    return contents.replace(
      /  override fun onAttachedToWindow\(\) \{[\s\S]*?\n    super\.onAttachedToWindow\(\)/,
      replacement,
    );
  }

  return contents.replace(
    '  override fun onAttachedToWindow() {\n    super.onAttachedToWindow()',
    replacement,
  );
}

function applyVideoViewPiPPatch(contents) {
  let next = addPiPLayoutFlags(contents);
  next = replacePiPEnter(next);
  next = replacePiPExitBlock(next);
  next = patchOnAttachedToWindow(next);
  if (!next.includes(PATCH_MARKER)) {
    throw new Error('Failed to apply expo-video PiP patch to VideoView.kt');
  }
  return next;
}

function applyPiPFragmentPatch(_contents) {
  return PATCHED_FRAGMENT;
}

function applyExpoVideoPiPPatches(projectRoot) {
  const videoViewPath = path.join(projectRoot, VIDEO_VIEW_TARGET);
  const fragmentPath = path.join(projectRoot, PIP_FRAGMENT_TARGET);

  if (!fs.existsSync(videoViewPath)) {
    return false;
  }

  fs.writeFileSync(videoViewPath, applyVideoViewPiPPatch(fs.readFileSync(videoViewPath, 'utf8')));
  fs.writeFileSync(fragmentPath, applyPiPFragmentPatch(fs.readFileSync(fragmentPath, 'utf8')));
  return true;
}

function withAndroidVideoPiPExitFix(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      applyExpoVideoPiPPatches(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidVideoPiPExitFix;
module.exports.applyExpoVideoPiPPatches = applyExpoVideoPiPPatches;
