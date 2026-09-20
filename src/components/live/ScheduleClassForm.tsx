import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyErrorMessage } from '../friendlyError';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../keyboard';
import { createLiveClass, type LiveClass } from '../../features/liveClasses/api';
import {
  quickPicks,
  TITLE_MAX_LENGTH,
  validateScheduleForm,
  type ScheduleFormErrors,
} from '../../features/liveClasses/scheduleForm';
import { LiveButton } from './LiveButton';

export const FORM_BOTTOM_PADDING = 24;
const INPUT =
  'min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';

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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const dateRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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
    // 'padding' on BOTH platforms: with Android edge-to-edge the window no longer resizes for the
    // keyboard, so an undefined behavior leaves the focused field and submit button covered.
    <KeyboardAvoidingView className="flex-1 bg-white" behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
      <ScrollView
        testID="schedule-form-scroll"
        className="flex-1 px-4"
        contentContainerClassName="gap-4"
        // The tab bar under this screen already clears the home indicator: no insets.bottom here.
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: FORM_BOTTOM_PADDING }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="w-full max-w-[560px] gap-4 self-center">
          <LiveButton label="‹ Back" variant="ghost" onPress={onBack} className="self-start" accessibilityLabel="Back to live classes" />
          <Text className="text-2xl font-bold text-slate-900" accessibilityRole="header">
            Schedule class
          </Text>

          <View className="gap-1">
            <Text className="text-sm font-semibold text-slate-900">Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Saturday Conditioning"
              placeholderTextColor="#64748B"
              maxLength={TITLE_MAX_LENGTH + 20}
              autoCapitalize="sentences"
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => dateRef.current?.focus()}
              blurOnSubmit={false}
              accessibilityLabel="Class title"
              className={INPUT}
            />
            {errors.title ? <Text className="text-sm text-red-700">{errors.title}</Text> : null}
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-slate-900">Quick pick</Text>
            <View className="flex-row flex-wrap gap-2">
              {picks.map((pick) => (
                <LiveButton
                  key={pick.label}
                  label={pick.label}
                  variant="secondary"
                  onPress={() => {
                    setDate(pick.date);
                    setTime(pick.time);
                    setErrors((prev) => ({ ...prev, date: undefined, time: undefined, when: undefined }));
                  }}
                />
              ))}
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-sm font-semibold text-slate-900">Date</Text>
              <TextInput
                ref={dateRef}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748B"
                keyboardType="numbers-and-punctuation"
                autoComplete="off"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => timeRef.current?.focus()}
                blurOnSubmit={false}
                accessibilityLabel="Class date, year-month-day"
                className={INPUT}
              />
              {errors.date ? <Text className="text-sm text-red-700">{errors.date}</Text> : null}
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-sm font-semibold text-slate-900">Time</Text>
              <TextInput
                ref={timeRef}
                value={time}
                onChangeText={setTime}
                placeholder="18:00"
                placeholderTextColor="#64748B"
                keyboardType="numbers-and-punctuation"
                autoComplete="off"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
                accessibilityLabel="Class start time"
                className={INPUT}
              />
              {errors.time ? <Text className="text-sm text-red-700">{errors.time}</Text> : null}
            </View>
          </View>
          <Text className="text-xs text-slate-600">Times use your local time zone.</Text>
          {errors.when ? <Text className="text-sm text-red-700">{errors.when}</Text> : null}

          {create.isError ? (
            <Text className="text-sm text-red-700">
              {friendlyErrorMessage(create.error, 'Could not schedule the class.')}
            </Text>
          ) : null}

          <LiveButton
            label={create.isPending ? 'Scheduling…' : 'Schedule class'}
            onPress={submit}
            busy={create.isPending}
            accessibilityLabel="Schedule class"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
