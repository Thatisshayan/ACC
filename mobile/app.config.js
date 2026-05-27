const LOCAL_API_BASE_URL = 'http://127.0.0.1:4000';
const PRODUCTION_API_BASE_URL = 'https://acc-production-a26c.up.railway.app';
const PRODUCTION_PUBLIC_URL = 'https://acc-production-a26c.up.railway.app';
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'a19ba52b-3a96-4638-97f5-590a03b8cd59';

module.exports = ({ config }) => {
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_ACC_API_BASE_URL?.trim() ||
    config?.extra?.accApiBaseUrl ||
    process.env.EXPO_PUBLIC_ACC_PUBLIC_URL?.trim() ||
    config?.extra?.accPublicUrl ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_API_BASE_URL : LOCAL_API_BASE_URL);

  const publicAppUrl =
    process.env.EXPO_PUBLIC_ACC_WEBAPP_URL?.trim() ||
    config?.extra?.accWebAppUrl ||
    process.env.EXPO_PUBLIC_ACC_PUBLIC_URL?.trim() ||
    config?.extra?.accPublicUrl ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_PUBLIC_URL : LOCAL_API_BASE_URL);

  return {
    name: 'ACC',
    slug: 'acc-mobile',
    scheme: 'acc',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      backgroundColor: '#0a0a0f',
      resizeMode: 'contain',
    },
    ios: {
      bundleIdentifier: 'com.acc.mobile',
      supportsTablet: false,
      infoPlist: {
        NSMicrophoneUsageDescription: 'ACC uses the microphone for push-to-talk voice commands.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.acc.mobile',
      permissions: ['RECORD_AUDIO'],
    },
    extra: {
      accApiBaseUrl: apiBaseUrl,
      accPublicUrl: publicAppUrl,
      accWebAppUrl: publicAppUrl.replace(/\/$/, '') + '/mini',
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    plugins: ['expo-router', 'expo-secure-store'],
  };
};
