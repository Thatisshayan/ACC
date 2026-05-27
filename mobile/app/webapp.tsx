import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getMiniWebAppUrl } from '../src/lib/config';

export default function MiniWebAppScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const url = useMemo(() => {
    const value = Array.isArray(params.url) ? params.url[0] : params.url;
    return value || getMiniWebAppUrl();
  }, [params.url]);
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{title || 'Mini Web App'}</Text>
        <View style={styles.spacer} />
      </View>
      <WebView
        source={{ uri: url }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#34d399" />
            <Text style={styles.loadingText}>Loading ACC web app...</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  backText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  title: { color: '#fff', fontWeight: '800', fontSize: 14, flex: 1, textAlign: 'center' },
  spacer: { width: 56 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#0a0a0f' },
  loadingText: { color: '#9ca3af', fontSize: 13 },
});
