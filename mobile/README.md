# ACC Mobile

Cross-platform mobile shell for ACC using Expo.

## What it is
- iOS and Android app front door
- ACC backend remains the source of truth
- Telegram is fallback-only
- Voice-first assistant, private messenger, approvals, tasks, and launch truth

## Runtime
Set the backend URL with:

```bash
EXPO_PUBLIC_ACC_API_BASE_URL=http://127.0.0.1:4000
```

Defaults:
- iOS simulator: `http://localhost:4000`
- Android emulator: `http://10.0.2.2:4000`
- Production builds default to the Railway backend URL unless `EXPO_PUBLIC_ACC_API_BASE_URL` overrides it.

## Commands

```bash
cd mobile
npm install
npx eas login
npx eas build:configure
npm run start
npm run ios
npm run android
npm run build:android
npm run build:ios
npx eas build --platform ios
npx eas build --platform android
```

## Screens
- Assistant
- Messages
- Approvals
- Tasks
- Workflows
- Mini web app
- Settings

## Notes
- Push-to-talk uses `expo-av`
- The app uses the ACC backend assistant parse/execute contract
- The Workflows screen reads the live Task Bus catalog and can open the ACC mini web app surface
- SocialClaw remains `setup_required` until the API key is configured
- Set `EXPO_PUBLIC_ACC_API_BASE_URL` to your Railway backend URL before production builds
- `app.config.js` is now the source of truth for Expo and EAS runtime configuration
- EAS preview builds are the quickest path to a downloadable Android install while keeping iOS in the cloud build pipeline
- The mobile session stores your operator id and backend override locally with Secure Store
