import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

function icon(name: string) {
  return ({ color, size }: { color: string; size: number }) => <Ionicons name={name as any} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0f',
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: icon('sparkles') }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="approvals" options={{ title: 'Approvals', tabBarIcon: icon('checkmark-circle') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="workflows" options={{ title: 'Workflows', tabBarIcon: icon('apps') }} />
      <Tabs.Screen name="settings" options={{ title: 'More', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
