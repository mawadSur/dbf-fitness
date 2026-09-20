import { useRouter } from 'expo-router';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../src/components/keyboard';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../../src/components/coaching/BackButton';
import { ErrorBlock, LoadingBlock, PrimaryButton } from '../../src/components/coaching/StateBlock';
import { SpecialtyChipInput } from '../../src/components/coaching/SpecialtyChips';
import { isStaffRole, useAccount } from '../../src/components/coaching/useAccount';
import { useMyCoachProfile, useSaveMyCoachProfile } from '../../src/features/coaching/hooks';
import type { CoachProfileFieldErrors, CoachProfileInput } from '../../src/features/coaching/types';
import { BIO_MAX, validateCoachProfile } from '../../src/features/coaching/validators';

export default function CoachProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const profile = useMyCoachProfile();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const shell = (children: React.ReactNode) => (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F8FAFC' }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <View style={{ gap: 8 }}>
          <View style={{ alignItems: 'flex-start' }}>
            <BackButton onPress={goBack} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', color: '#0F172A' }}>
            My coach profile
          </Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (account.isLoading) return shell(<LoadingBlock />);

  if (account.isError) {
    return shell(<ErrorBlock message="Could not load your account." onRetry={() => account.refetch()} />);
  }

  if (!account.data || !isStaffRole(account.data.role)) {
    return shell(
      <Text style={{ fontSize: 15, color: '#334155' }}>The coach profile is for coaches and admins only.</Text>,
    );
  }

  if (profile.isLoading) return shell(<LoadingBlock label="Loading profile…" />);
  if (profile.isError) {
    return shell(<ErrorBlock message="Could not load your coach profile." onRetry={() => profile.refetch()} />);
  }

  return shell(
    <CoachProfileForm
      initial={
        profile.data
          ? {
              bio: profile.data.bio,
              specialties: profile.data.specialties,
              acceptingMembers: profile.data.acceptingMembers,
            }
          : { bio: '', specialties: [], acceptingMembers: true }
      }
    />,
  );
}

function CoachProfileForm({ initial }: { initial: CoachProfileInput }) {
  const save = useSaveMyCoachProfile();
  const [bio, setBio] = useState(initial.bio);
  const [specialties, setSpecialties] = useState<string[]>(initial.specialties);
  const [accepting, setAccepting] = useState(initial.acceptingMembers);
  const [errors, setErrors] = useState<CoachProfileFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onSave = async () => {
    Keyboard.dismiss();
    setSaved(false);
    setSaveError(null);
    const result = validateCoachProfile({ bio, specialties, acceptingMembers: accepting });
    setErrors(result.errors);
    if (!result.ok) return;
    try {
      await save.mutateAsync(result.value);
      setBio(result.value.bio);
      setSpecialties(result.value.specialties);
      setSaved(true);
    } catch {
      setSaveError('Could not save your profile. Check your connection and try again.');
    }
  };

  const bioLength = Array.from(bio).length;
  const overBio = bioLength > BIO_MAX;

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={(t) => {
            setBio(t);
            setSaved(false);
          }}
          multiline
          textAlignVertical="top"
          placeholder="Tell members about your coaching style"
          placeholderTextColor="#64748B"
          accessibilityLabel="Bio"
          returnKeyType="next"
          blurOnSubmit
          style={{
            minHeight: 120,
            borderWidth: 1,
            borderColor: errors.bio || overBio ? '#DC2626' : '#E2E8F0',
            borderRadius: 10,
            padding: 12,
            color: '#0F172A',
            backgroundColor: '#FFFFFF',
          }}
        />
        <Text
          testID="bio-counter"
          accessibilityLabel={`${bioLength} of ${BIO_MAX} characters`}
          style={{ alignSelf: 'flex-end', fontSize: 13, color: overBio ? '#B91C1C' : '#475569' }}
        >
          {`${bioLength}/${BIO_MAX}`}
        </Text>
        {errors.bio ? (
          <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 13 }}>
            {errors.bio}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>Specialties</Text>
        <SpecialtyChipInput
          items={specialties}
          onChange={(next) => {
            setSpecialties(next);
            setSaved(false);
          }}
          error={errors.specialties}
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
          gap: 12,
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' }}>Accepting members</Text>
        <Switch
          value={accepting}
          onValueChange={(v) => {
            setAccepting(v);
            setSaved(false);
          }}
          accessibilityLabel="Accepting members"
          trackColor={{ true: '#047857', false: '#CBD5E1' }}
        />
      </View>

      {saveError ? (
        <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 14 }}>
          {saveError}
        </Text>
      ) : null}
      {saved ? (
        <Text accessibilityRole="alert" style={{ color: '#047857', fontSize: 14, fontWeight: '600' }}>
          Profile saved.
        </Text>
      ) : null}
      <PrimaryButton label="Save profile" busy={save.isPending} onPress={onSave} />
    </>
  );
}
