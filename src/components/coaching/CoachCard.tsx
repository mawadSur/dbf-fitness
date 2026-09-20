import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Coach, MyCoach } from '../../features/coaching/types';
import { coachCardState, initialOf } from './coachCardState';
import { SpecialtyChipList } from './SpecialtyChips';

const BIO_COLLAPSED_LINES = 3;

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: fg }}>{text}</Text>
    </View>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#065F46' }}>{initialOf(name)}</Text>
    </View>
  );
}

type Props = {
  coach: Coach;
  currentCoachId?: string | null;
  onSelect?: (coach: Coach) => void;
  disabled?: boolean;
};

export function CoachCard({ coach, currentCoachId, onSelect, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const state = coachCardState(coach, currentCoachId);
  const bio = coach.bio?.trim() ?? '';
  const longBio = bio.length > 120;

  return (
    <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={coach.fullName} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', color: '#0F172A' }}>
            {coach.fullName || 'Coach'}
          </Text>
          <Text style={{ fontSize: 13, color: '#475569' }}>{state.memberCountLabel}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {state.availability === 'accepting' ? (
          <Badge text="Accepting members" bg="#D1FAE5" fg="#065F46" />
        ) : (
          <Badge text="Not accepting" bg="#F1F5F9" fg="#475569" />
        )}
        {state.isCurrent ? <Badge text="Your coach" bg="#047857" fg="#FFFFFF" /> : null}
      </View>

      {bio ? (
        <View style={{ gap: 4 }}>
          <Text numberOfLines={expanded ? undefined : BIO_COLLAPSED_LINES} style={{ fontSize: 14, color: '#334155', lineHeight: 20 }}>
            {bio}
          </Text>
          {longBio ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? `Show less about ${coach.fullName}` : `Read more about ${coach.fullName}`}
              accessibilityState={{ expanded }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#047857', fontWeight: '600' }}>{expanded ? 'Show less' : 'Read more'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SpecialtyChipList items={coach.specialties} />

      {onSelect ? (
        <Pressable
          onPress={() => onSelect(coach)}
          disabled={!state.selectable || disabled}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${coach.fullName} as your coach`}
          accessibilityState={{ disabled: !state.selectable || !!disabled }}
          android_ripple={{ color: '#A7F3D0' }}
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            backgroundColor: state.selectable && !disabled ? '#047857' : '#E2E8F0',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontWeight: '600', color: state.selectable && !disabled ? '#FFFFFF' : '#475569' }}>
            {state.isCurrent ? 'Current coach' : state.selectable ? 'Choose coach' : 'Not accepting'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The member's current coach, shown on the profile tab. */
export function CurrentCoachCard({ coach, onChange }: { coach: MyCoach; onChange: () => void }) {
  const bio = coach.bio?.trim() ?? '';
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={coach.fullName} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#0F172A' }}>
          {coach.fullName || 'Coach'}
        </Text>
      </View>
      {bio ? <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20 }}>{bio}</Text> : null}
      <SpecialtyChipList items={coach.specialties} />
      <Pressable
        onPress={onChange}
        accessibilityRole="button"
        accessibilityLabel="Change coach"
        android_ripple={{ color: '#A7F3D0' }}
        style={({ pressed }) => ({
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#047857',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontWeight: '600', color: '#047857' }}>Change coach</Text>
      </Pressable>
    </View>
  );
}
