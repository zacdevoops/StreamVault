# 📺 StreamVault

> Application mobile native pour découvrir, lire, télécharger et réécouter du contenu vidéo et audio en ligne.

![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-native-61DAFB?logo=react)
![Python](https://img.shields.io/badge/Backend-FastAPI%20%2B%20yt--dlp-009688?logo=fastapi)
![Platforms](https://img.shields.io/badge/Platforms-iOS%20%7C%20Android-lightgrey)

---

## 🗂️ Table des matières

- [Présentation](#-présentation)
- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Structure du projet](#-structure-du-projet)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Lancer le backend](#-lancer-le-backend)
- [Lancer l'application](#-lancer-lapplication)
- [Variables d'environnement](#-variables-denvironnement)
- [Vérifications qualité](#-vérifications-qualité)
- [Téléchargements](#-téléchargements)
- [Limitations connues](#-limitations-connues)

---

## 🎬 Présentation

StreamVault est une application **Expo React Native** entièrement native (iOS & Android) permettant de rechercher, lire et télécharger des vidéos et podcasts depuis le web. Le traitement lourd (extraction de flux via `yt-dlp`) est délégué à un petit serveur backend **FastAPI**, gardant ainsi l'application mobile légère et réactive.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🎥 Lecture vidéo native | Powered by `expo-video` |
| 🎵 Lecture audio en arrière-plan | Powered by `expo-audio`, même en mode minimisé |
| 📂 Catégories | All, Music, Gaming, News, Sports, Podcasts |
| 🔍 Recherche multi-sources | Backend, YouTube, Invidious, Piped |
| ⬇️ Téléchargement | Formats MP4 (vidéo) et MP3/FLAC (audio) |
| 📴 Lecture hors-ligne | Depuis l'onglet Téléchargements |
| 📜 Historique & favoris | Persisté localement via SQLite |
| 💾 Persistance des téléchargements | Métadonnées stockées en SQLite |

---

## 🏗️ Architecture

L'application mobile **ne fait jamais tourner `yt-dlp` directement**. La résolution du contenu suit l'ordre de priorité suivant :

```
1. Variable d'environnement EXPO_PUBLIC_YTDLP_API_URL (si définie)
          ↓
2. Backend local de développement
   - iOS Simulator  → http://localhost:8787
   - Android Emulator → http://10.0.2.2:8787
   - LAN (Expo dev server host) → port 8787
          ↓
3. Fallbacks publics Invidious / Piped
   (best-effort, peuvent être indisponibles ou rate-limités)
```

> ⚠️ Pour une lecture et des téléchargements fiables, il est fortement recommandé de faire tourner le backend FastAPI local.

### Endpoints disponibles du backend

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Vérification d'état |
| `POST` | `/extract` | Extraction de métadonnées |
| `POST` | `/resolve` | Résolution du contenu |
| `POST` | `/playback` | URL de lecture vidéo |
| `POST` | `/audio` | URL de lecture audio |
| `GET` | `/feed` | Flux de contenus par catégorie |
| `GET` | `/download` | Lancement d'un téléchargement |

---

## 📁 Structure du projet

```
StreamVault/
├── app/                    # Écrans et onglets (Expo Router)
├── components/             # Composants UI réutilisables
│   ├── VideoCard           # Carte vidéo
│   ├── MiniPlayer          # Lecteur miniaturisé
│   └── DownloadRow         # Ligne de téléchargement
├── services/
│   ├── api.ts              # Couche API (search, playback, download…)
│   └── database.ts         # Persistance SQLite locale
├── stores/                 # État global (Zustand)
│   ├── library             # Bibliothèque utilisateur
│   ├── downloads           # Téléchargements en cours
│   └── player              # État du lecteur
├── server/
│   └── ytdlp-api/          # Backend FastAPI (yt-dlp)
├── android/                # Projet natif Android
└── ios/                    # Projet natif iOS
```

---

## ⚙️ Prérequis

- **Node.js** — compatible avec Expo SDK 54
- **npm**
- **Xcode** — pour les builds iOS (simulateur)
- **Android Studio / Android SDK** — pour les builds Android (émulateur)
- **Python 3.11+** — pour le backend
- **ffmpeg** — installé sur la machine du backend (requis pour MP4 fusionné et extraction MP3/FLAC)

---

## 🚀 Installation

### 1. Dépendances Node.js

```bash
npm ci
```

### 2. Dépendances backend Python

```bash
cd server/ytdlp-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

---

## 🖥️ Lancer le backend

```bash
cd server/ytdlp-api
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8787
```

Vérifier que le backend est opérationnel :

```bash
curl http://localhost:8787/health
```

---

## 📱 Lancer l'application

**iOS Simulator :**
```bash
EXPO_PUBLIC_YTDLP_API_URL=http://localhost:8787 npx expo run:ios
```

**Android Emulator :**
```bash
EXPO_PUBLIC_YTDLP_API_URL=http://10.0.2.2:8787 npx expo run:android
```

**Expo Dev Server (scan QR) :**
```bash
npm run dev
```

---

## 🔐 Variables d'environnement

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_YTDLP_API_URL` | URL du backend yt-dlp à utiliser |

```bash
# iOS Simulator
EXPO_PUBLIC_YTDLP_API_URL=http://localhost:8787

# Android Emulator (backend sur la machine hôte)
EXPO_PUBLIC_YTDLP_API_URL=http://10.0.2.2:8787
```

---

## ✅ Vérifications qualité

À lancer avant d'ouvrir une Pull Request :

```bash
# TypeScript
npm run typecheck

# Lint
npm run lint

# Tests
npx jest --passWithNoTests

# Compatibilité des dépendances Expo
npx expo install --check

# Syntaxe backend Python
PYTHONPYCACHEPREFIX=/private/tmp/streamvault-pycache \
  python3 -m py_compile server/ytdlp-api/app.py

# Validation native
npx expo run:ios
npx expo run:android
```

---

## 📥 Téléchargements

Les fichiers sont sauvegardés dans le répertoire document d'Expo, sous `StreamVault/`, via `expo-file-system/legacy`.

Les métadonnées sont persistées en SQLite et les téléchargements terminés sont accessibles depuis l'onglet **Téléchargements** :

- **Vidéo MP4** → lu avec `expo-video`
- **Audio MP3/FLAC** → lu avec `expo-audio`

Si un fichier est introuvable sur le disque, l'app propose de conserver ou supprimer l'entrée obsolète.

---

## 🐛 Limitations connues

- Les API publiques Invidious/Piped sont en best-effort et peuvent échouer selon le réseau ou l'état des instances.
- L'extraction yt-dlp peut prendre **30 à 60 secondes** au premier appel pour certaines vidéos.
- L'extraction MP3/FLAC nécessite **ffmpeg** sur la machine du backend.
- StreamVault est une app Expo **native**, pas une WebView.
- Le comportement de téléchargement/streaming doit être revu pour la conformité **App Store** et **Google Play** avant toute soumission.

---

## 🧪 Vidéo de test rapide

Pour les smoke tests, cette vidéo courte est idéale :

```
ID  : jNQXAC9IVRw
URL : https://www.youtube.com/watch?v=jNQXAC9IVRw
```

---

## 📄 Licence

> Ajouter votre licence ici (MIT, Apache 2.0, propriétaire…)
