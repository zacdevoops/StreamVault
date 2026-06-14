# AGENTS.md — StreamVault

> For all AI coding agents (Codex, OpenCode, Kimi, Cursor, Claude, etc.)
> User instructions ALWAYS override this file.

---

# ⚡ CRITICAL RULES — READ FIRST (always apply, no exceptions)

1. **Goal**: App Store + Google Play production-ready. Priority: crashes → blocked flows → runtime errors → compliance → performance → polish.
2. **Cross-platform**: Every fix must work on BOTH iOS and Android. Never fix one by breaking the other.
3. **Default scope = MICRO** (1 file, ≤30 lines). Escalate only when necessary.
4. **Quality gates** must pass before any task is marked complete:
   ```bash
   npm run typecheck       # tsc --noEmit
   npm run lint            # expo lint
   npx jest --passWithNoTests
   npx expo install --check
   ```
5. **Never**: use `@ts-ignore`, `eslint-disable`, swallow errors silently, patch symptoms instead of root cause.

---

# 1. REPO OVERVIEW

| Layer | Tech |
|---|---|
| Frontend | Expo SDK 54 + React Native 0.81.5 (New Architecture) + TypeScript strict |
| Routing | Expo Router file-based (`app/`), lazy/async routes wrapped in `Suspense` |
| Backend | FastAPI + yt-dlp + ffmpeg in `server/ytdlp-api/` |
| State | Zustand stores: `library`, `downloads`, `player` |
| Persistence | SQLite via `services/database.ts` |
| Downloads | `expo-file-system/legacy` → `FileSystem.documentDirectory/StreamVault/` |

## Monorepo boundaries

```
app/                  Expo Router screens and layouts
components/           VideoCard, MiniPlayer, DownloadRow
services/             api.ts (API layer), database.ts (SQLite)
stores/               library, downloads, player (Zustand)
server/ytdlp-api/     Python backend — do not import from JS
android/ ios/         Native projects
```

---

# 2. QUICK COMMANDS

```bash
# Install
npm ci
cd server/ytdlp-api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Quality gates (run in this order)
npm run typecheck
npm run lint
npx jest --passWithNoTests
npx expo install --check

# Backend
source server/ytdlp-api/.venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8787
python3 -m py_compile server/ytdlp-api/app.py   # syntax check before PR
curl http://localhost:8787/health                # health check

# Frontend (backend must be running)
EXPO_PUBLIC_YTDLP_API_URL=http://localhost:8787 npx expo run:ios
EXPO_PUBLIC_YTDLP_API_URL=http://10.0.2.2:8787 npx expo run:android
# Physical Android device: use host machine LAN IP, not 10.0.2.2

# Metro
npx expo start --clear
npx expo start --no-dev --minify   # production mode

# Native rebuild
cd ios && pod install && cd ..     # run from ios/ not repo root

# Targeted checks
npx tsc --noEmit services/api.ts
adb logcat *:S ReactNative:V ReactNativeJS:V
npx expo doctor
```

---

# 3. BACKEND GOTCHAS

- App **never runs yt-dlp directly** — backend must be running for playback/downloads.
- Backend requires an executable `yt-dlp` or `yt-dlp_macos` binary inside `server/ytdlp-api/`.
- `ffmpeg` must be installed on the host (required for MP4 merging and MP3/FLAC extraction).
- Endpoint responsibilities:
  - `/playback`, `/audio` → return stream URLs (use for native players)
  - `/download` → full transcode, returns file — **do not use for streaming**
  - `/extract`, `/resolve`, `/feed`, `/health`

---

# 4. FRONTEND GOTCHAS

- **New Architecture**: `newArchEnabled: true` in `app.json` and `android/gradle.properties`.
- **JDK 21 required**: `gradle.properties` hardcodes JDK 21. Java 24 breaks NitroModules CMake.
- **Babel**: `react-native-reanimated/plugin` required in `babel.config.js`.
- **Metro**: `experimentalImportSupport: true` + `inlineRequires: true` — do not remove; affects bundle pruning and startup. Note: these flags can cause unexpected fast-refresh behavior; do a full Metro restart if hot reload behaves incorrectly.
- **Audio**: iOS audio policy is in `ios/StreamVault/AppDelegate.swift` (`AVAudioSession`). Never call `expo-audio`'s `setAudioModeAsync` from JS root layout — it races with native setup. One source of truth only.
- **Env vars**: `process.env.EXPO_PUBLIC_YTDLP_API_URL`. `services/api.ts` declares `process` manually (RN TS does not expose it globally).
- **File downloads**: Use `expo-file-system/legacy` APIs. Use `FileSystem.documentDirectory` only — never `cacheDirectory` for persistent files.
- **tsconfig**: includes `nativewind-env.d.ts` which does not exist. Only create it if adding NativeWind (adding NativeWind is a SYSTEM task requiring approval).
- **Prettier**: single quote, tab width 2.
- **Bundle size**: JS bundle must stay under 4MB (Hermes + Expo baseline is ~3MB minimum).
- **Images**: prefer `expo-image` over `react-native-fast-image`.

---

# 5. TASK SCOPE RULES

| Scope | Files | Lines | Requirement |
|---|---|---|---|
| MICRO | 1 | ≤30 | Default — use always |
| LOCAL | ≤3 | ≤150 | When MICRO is not enough |
| SYSTEM | any | any | Requires implementation plan + approval before coding |

**SYSTEM tasks include**: architecture changes, dependency changes, native module additions, auth rewrites, streaming/download architecture changes, SQLite schema migrations.

Never scan the full repository unless SYSTEM scope is approved.

---

# 6. WORKFLOW PHASES

Never skip phases:

1. Environment stabilization
2. Build stability
3. Runtime crash fixing
4. Functional validation
5. Cross-platform validation
6. Performance optimization
7. App Store / Play Store compliance
8. Release preparation
9. Final QA

---

# 7. DEBUGGING RULES

Fix **root cause only**. Never patch symptoms.

Debug order:
1. JS/runtime errors
2. iOS native crashes
3. Android native crashes
4. API failures
5. Lifecycle/state bugs
6. Performance bottlenecks

Never: hide loaders, swallow errors silently, add random retries, force rerenders blindly.

## Autonomous fix loop

**Max 3 iterations per issue.**

- **Iteration 1**: Read full error → fix root cause → rerun.
- **Iteration 2**: Research Expo docs, RN docs, GitHub issues → apply documented solution → rerun.
- **Iteration 3**: Environment reset:
  ```bash
  npx expo start --clear
  watchman watch-del-all
  cd ios && pod install && cd ..
  ```
  Then rerun.

**After 3 failures**: STOP. Summarize blocker. Explain required human action.

---

# 8. VIDEO & DOWNLOAD RULES

## Video
- Verify: playback works, switching videos works, previous state clears, controls respond, no black screens.
- Always release players on unmount, show user-visible errors, handle expired URLs.

## Downloads
- Verify: progress updates, file exists after restart, partial downloads cleaned, airplane mode handled.
- Use `FileSystem.documentDirectory` only — never `cacheDirectory`.

## SQLite
- Schema migrations are a **SYSTEM task** — require approval before any column/table change.
- Never modify schema without a migration path for existing installs.

---

# 9. ZUSTAND STORE RULES

- `player`, `downloads`, `library` stores must be written independently — no cross-store direct writes.
- If a store depends on another store's state, use selectors or subscriptions — never import store setters cross-store.
- Race conditions between player and downloads stores are a known risk — flag any concurrent write pattern for human review.

---

# 10. PERFORMANCE RULES

Before release:
- Remove unnecessary rerenders, avoid memory leaks, optimize FlatList, verify image caching, verify player cleanup, verify background handling.
- Lazy load all non-initial screens via Expo Router async routes, wrapped in `React.Suspense`.
- Load only font weights used in the UI.
- Run `depcheck` + manual import audit before removing any dependency.

Must test: low network, repeated navigation, background/foreground, orientation changes, reload persistence.

---

# 11. APP STORE / PLAY STORE COMPLIANCE

**yt-dlp integration is an intentional product decision made by the project owner.** Do not question or remove it. Do not suggest replacing it with a different architecture.

Agent responsibility is limited to technical compliance. Store policy decisions are owned by the project owner.

Technical requirements before marking PASS:
- Background download entitlements configured (`UIBackgroundModes`) if background downloads are used
- No DRM content streamed without entitlements
- Store metadata accurately describes app functionality

Agent checklist (verify before marking PASS):
- No broken permissions
- No placeholder assets
- No `console.log` in production code (strip or guard with `__DEV__`)
- Privacy usage descriptions exist
- Icons and splash screens configured
- Version/build numbers valid
- No broken external links
- No hidden crashes

---

# 12. RELEASE CHECKLIST

## iOS
- Release build succeeds, archive succeeds
- Bundle identifier correct, signing correct
- Permission strings correct

## Android
- Release build succeeds, Gradle build succeeds
- Package name correct, release signing configured
- Proguard/R8 safe

## Expo
- `app.json` valid, `eas.json` valid
- OTA config verified, icons/splash verified

---

# 13. TASK REPORT FORMAT

Every task MUST end with:

```md
## Task Report

### ✅ Changes Made
- [file] — [what changed]

### 🧪 Commands Run
- command → PASS / FAIL

### 🔍 Research Done
- URL — finding

### ⚠️ Known Issues
- remaining issues

### 🚫 Not Done
- skipped work + reason

### 📋 Next Steps
- human validation required
```

Never mark production-ready if typecheck, lint, tests, runtime validation, or release builds fail.

---

# 14. QUICK REFERENCE

| Goal | Command |
|---|---|
| Start Metro | `npx expo start` |
| iOS simulator | `npx expo start --ios` |
| iOS native build | `npx expo run:ios` |
| Android emulator | `npx expo start --android` |
| Android native build | `npx expo run:android` |
| Clear cache | `npx expo start --clear` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npx jest --passWithNoTests` |
| Install Expo pkg | `npx expo install <pkg>` |
| Rebuild iOS | `cd ios && pod install && cd ..` |
| Android logs | `adb logcat *:S ReactNative:V ReactNativeJS:V` |
| Check environment | `npx expo doctor` |
| Production mode | `npx expo start --no-dev --minify` |
| Backend syntax check | `python3 -m py_compile server/ytdlp-api/app.py` |
| Backend health | `curl http://localhost:8787/health` |