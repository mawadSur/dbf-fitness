import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { createLiveClass, type LiveClass } from '../../features/liveClasses/api';
import {
  quickPicks,
  TITLE_MAX_LENGTH,
  validateScheduleForm,
  type ScheduleFormErrors,
} from '../../features/liveClasses/scheduleForm';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import {
  Banner,
  Button,
  Chip,
  Input,
  ScreenHeader,
  ScreenShell,
  SectionHeader,
  Text,
} from '../ui';

/** Kept for the safe-area test: the shell's scroll padding inside the tab shell. */
export const FORM_BOTTOM_PADDING = 24;

/** Coach-only "Schedule class" form. Times are read as the user's LOCAL time. */
export function ScheduleClassForm({
  coachId,
  onBack,
  onCreated,
}: {
  coachId: string;
  onBack: () => void;
  onCreated: (created: LiveClass) => void;
}) {
  const queryClient = useQueryClient();
  const { tokens } = useOptionalTheme();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [errors, setErrors] = useState<ScheduleFormErrors>({});

  const create = useMutation({
    mutationFn: (input: { title: string; startsAt: Date }) => createLiveClass({ coachId, ...input }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['liveClasses'] });
      onCreated(created);
    },
  });

  const submit = () => {
    Keyboard.dismiss();
    const result = validateScheduleForm({ title, date, time });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    create.mutate({ title: result.title, startsAt: result.startsAt });
  };

  const picks = quickPicks();

  return (
    <ScreenShell
      testID="schedule-form"
      insideTabs
      keyboardAvoiding
      contentStyle={{ gap: tokens.space.lg }}
      header={
        <ScreenHeader
          title="Schedule class"
          eyebrow="Coach"
          onBack={onBack}
          backAccessibilityLabel="Back to live classes"
        />
      }
    >
      <Input
        testID="class-title"
        label="Class title"
        value={title}
        onChangeText={setTitle}
        placeholder="Saturday Conditioning"
        helperText={`Up to ${TITLE_MAX_LENGTH} characters.`}
        error={errors.title}
        autoCapitalize="sentences"
        autoComplete="off"
        returnKeyType="next"
        required
      />

      <View style={{ gap: tokens.space.sm }}>
        <SectionHeader title="Quick pick" style={{ marginBottom: 0 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
          {picks.map((pick) => (
            <Chip
              key={pick.label}
              testID={`quick-pick-${pick.label}`}
              label={pick.label}
              icon="clock"
              selected={picked === pick.label}
              onPress={() => {
                setDate(pick.date);
                setTime(pick.time);
                setPicked(pick.label);
                setErrors((previous) => ({ ...previous, date: undefined, time: undefined, when: undefined }));
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md }}>
        <Input
          testID="class-date"
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="2026-10-03"
          helperText="Year-month-day, like 2026-10-03."
          error={errors.date}
          keyboardType="numbers-and-punctuation"
          autoComplete="off"
          returnKeyType="next"
          required
          style={{ flexGrow: 1, flexBasis: 150 }}
        />
        <Input
          testID="class-time"
          label="Start time"
          value={time}
          onChangeText={setTime}
          placeholder="18:00"
          helperText="24-hour clock, like 18:00."
          error={errors.time}
          keyboardType="numbers-and-punctuation"
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={submit}
          required
          style={{ flexGrow: 1, flexBasis: 150 }}
        />
      </View>

      <Text role="caption" tone="muted">
        Times use your local time zone.
      </Text>

      {errors.when ? <Banner tone="danger" title={errors.when} testID="schedule-when-error" /> : null}

      {create.isError ? (
        <Banner
          tone="danger"
          title={friendlyErrorMessage(create.error, 'Could not schedule the class.')}
          testID="schedule-create-error"
        />
      ) : null}

      <Button
        label="Schedule class"
        leadingIcon="calendar"
        onPress={submit}
        loading={create.isPending}
        accessibilityLabel="Schedule class"
      />
    </ScreenShell>
  );
}
