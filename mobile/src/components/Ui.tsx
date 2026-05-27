import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Card({ children, tone = 'panel' }: { children: React.ReactNode; tone?: 'panel' | 'hero' | 'ghost' }) {
  return <View style={[styles.card, tone === 'hero' && styles.hero, tone === 'ghost' && styles.ghost]}>{children}</View>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionEyebrow}>ACC MOBILE</Text>
      <Text style={styles.sectionHeading}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'blue' }) {
  return <Text style={[styles.pill, toneStyles[tone]]}>{children}</Text>;
}

export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  compact = false,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
  compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, actionStyles[tone], compact && styles.compact, pressed && { opacity: 0.85 }]}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    gap: 10,
  },
  hero: {
    backgroundColor: 'rgba(7, 11, 22, 0.95)',
    borderColor: 'rgba(16,185,129,0.15)',
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sectionTitle: { gap: 4, marginBottom: 8 },
  sectionEyebrow: { color: '#6b7280', fontSize: 11, letterSpacing: 1.8, fontWeight: '700' },
  sectionHeading: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  sectionSub: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    letterSpacing: 1,
    overflow: 'hidden',
    color: '#e5e7eb',
    textTransform: 'uppercase',
  },
  action: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});

const toneStyles: Record<string, any> = {
  neutral: { backgroundColor: 'rgba(255,255,255,0.07)', color: '#d1d5db' },
  good: { backgroundColor: 'rgba(16,185,129,0.14)', color: '#a7f3d0' },
  warn: { backgroundColor: 'rgba(245,158,11,0.16)', color: '#fde68a' },
  bad: { backgroundColor: 'rgba(239,68,68,0.16)', color: '#fecaca' },
  blue: { backgroundColor: 'rgba(59,130,246,0.16)', color: '#bfdbfe' },
};

const actionStyles: Record<string, any> = {
  primary: { backgroundColor: '#10b981' },
  secondary: { backgroundColor: 'rgba(255,255,255,0.08)' },
  danger: { backgroundColor: 'rgba(239,68,68,0.18)' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.03)' },
};
