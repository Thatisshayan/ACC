import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SessionProvider, useSession } from '../src/lib/session';
import { registerWithHub } from '../src/lib/api';

function HubRegistrar() {
  const { ready } = useSession();
  React.useEffect(() => {
    if (!ready) return;
    registerWithHub({
      id:           'acc-mobile-' + Platform.OS,
      name:         'ACC Mobile (' + Platform.OS + ')',
      type:         'mobile',
      capabilities: ['notifications', 'approvals', 'voice', 'workflows'],
      description:  'ACC React Native mobile app on ' + Platform.OS,
    }).catch(() => {}); // fire-and-forget, never block the app
  }, [ready]);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      <SafeAreaProvider>
        <SessionProvider>
          <HubRegistrar />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
