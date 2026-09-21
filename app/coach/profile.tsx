import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Keyboard, Switch, View } from 'react-native';

import { ErrorBlock, LoadingBlock } from '../../src/components/coaching/StateBlock';
import { SpecialtyChipInput } from '../../src/components/coaching/SpecialtyChips';
import { isStaffRole, useAccount } from '../../src/components/coaching/useAccount';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  ListRow,
  ScreenHeader,
  ScreenShell,
  SectionHeader,
  Text,
} from '../../src/components/ui';
import { useMyCoachProfile, useSaveMyCoachProfile } from '../../src/features/coaching/hooks';
import type { CoachProfileFieldErrors, CoachProfileInput } from '../../src/features/coaching/types';
import { BIO_MAX, validateCoachProfile } from '../../src/features/coaching/validators';
import { useOptionalTheme } from '../../src/theme/ThemeProvider';

export default function CoachProfileScreen() {
  const router = useRouter();
  const account = useAccount();
  const profile = useMyCoachProfile();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const shell = (children: ReactNode) => (
    <ScreenShell
      keyboardAvoiding
      testID="coach-profile"
      header={<ScreenHeader eyebrow="Coaching" title="My coach profile" onBack={goBack} />}
      contentStyle={{ gap: 16 }}
    >
      {children}
    </ScreenShell>
  );

  if (account.isLoading) return shell(<LoadingBlock label="Loading your account…" />);

  if (account.isError) {
    return shell(<ErrorBlock message="Could not load your account." onRetry={() => account.refetch()} />);
  }

  if (!account.data || !isStaffRole(account.data.role)) {
    return shell(
      <EmptyState
        icon="lock"
        title="Coaches only"
        message="The coach profile is for coaches and admins only."
        actionLabel="Go back"
        onAction={goBack}
      />,
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
  const { colors } = useOptionalTheme();
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
      <Card>
        <View style={{ gap: 12 }}>
          <SectionHeader title="About you" subtitle="Members read this before they choose you." />
          <Input
            label="Bio"
            value={bio}
            onChangeText={(next) => {
              setBio(next);
              setSaved(false);
            }}
            multiline
            placeholder="Tell members about your coaching style"
            error={errors.bio}
            returnKeyType="default"
          />
          <Text
            role="caption"
            tone={overBio ? 'danger' : 'muted'}
            align="right"
            testID="bio-counter"
            accessibilityLabel={`${bioLength} of ${BIO_MAX} characters`}
          >
            {`${bioLength}/${BIO_MAX}`}
          </Text>
        </View>
      </Card>

      <Card>
        <View style={{ gap: 12 }}>
          <SectionHeader title="Specialties" subtitle="Up to eight, shown as chips on your card." />
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
      </Card>

      <Card>
        <ListRow
          title="Accepting members"
          subtitle={accepting ? 'Members can choose you now.' : 'Members cannot choose you.'}
          icon={accepting ? 'check-circle' : 'lock'}
          trailing={
            <Switch
              value={accepting}
              onValueChange={(next) => {
                setAccepting(next);
                setSaved(false);
              }}
              accessibilityLabel="Accepting members"
              trackColor={{ true: colors.progressArc, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          }
        />
      </Card>

      {saveError ? <Banner tone="danger" title={saveError} /> : null}
      {saved ? <Banner tone="success" title="Profile saved." /> : null}

      <Button label="Save profile" onPress={onSave} loading={save.isPending} fullWidth />
    </>
  );
}
