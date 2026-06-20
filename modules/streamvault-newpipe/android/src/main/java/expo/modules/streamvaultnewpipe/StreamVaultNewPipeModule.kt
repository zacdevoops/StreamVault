package expo.modules.streamvaultnewpipe

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StreamVaultNewPipeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamVaultNewPipe")

    OnCreate {
      Log.i(TAG, "Phase0 module registered; ping=ok")
    }

    AsyncFunction("ping") {
      return@AsyncFunction "ok"
    }
  }

  companion object {
    private const val TAG = "StreamVaultNewPipe"
  }
}
