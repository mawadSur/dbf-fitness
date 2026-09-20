import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';

import { blockUser, reportUser } from '../../features/community/api';
import {
  buildReportReason,
  MAX_REPORT_DETAILS_LENGTH,
  REPORT_REASONS,
  type ReportReason,
} from '../../features/community/reportReasons';
import { initialsOf, type RosterEntry } from '../../features/community/roster';
import { friendlyErrorMessage } from '../friendlyError';
import { colors } from '../../theme/tokens';
import type { Notice } from './NoticeBanner';
import { useScrollIntoView } from './ScrollIntoView';

type Panel = 'closed' | 'menu' | 'report' | 'block' | 'reported';

type PersonRowProps = {
  entry: RosterEntry;
  onNotice: (notice: Notice) => void;
};

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export function PersonRow({ entry, onNotice }: PersonRowProps) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>('closed');
  const [preset, setPreset] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const scrollIntoView = useScrollIntoView();
  const reportFormRef = useRef<View>(null);

  const reportMutation = useMutation({
    mutationFn: (reason: string) => reportUser(entry.memberId, reason),
    onSuccess: () => {
      setPanel('reported');
      setPreset(null);
      setDetails('');
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => blockUser(entry.memberId),
    onSuccess: () => {
      onNotice({ tone: 'success', text: `Blocked ${entry.fullName}. They no longer appear in your groups.` });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (error) => {
      onNotice({ tone: 'error', text: errorMessage(error, `Could not block ${entry.fullName}.`) });
    },
  });

  const busy = reportMutation.isPending || blockMutation.isPending;

  function toggleRow() {
    if (busy) return;
    setPanel((current) => (current === 'closed' ? 'menu' : 'closed'));
    setFormError(null);
    reportMutation.reset();
  }

  function submitReport() {
    Keyboard.dismiss();
    const result = buildReportReason(preset, details);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormError(null);
    reportMutation.mutate(result.reason);
  }

  return (
    <View className="rounded-lg border border-slate-200 bg-slate-50">
      <Pressable
        onPress={toggleRow}
        accessibilityRole="button"
        accessibilityLabel={`${entry.fullName}, ${entry.online ? 'online' : 'offline'}. Show actions`}
        accessibilityState={{ expanded: panel !== 'closed', disabled: busy }}
        android_ripple={{ color: 'rgba(15,23,42,0.12)' }}
        className="min-h-[56px] flex-row items-center gap-3 px-4 py-2 active:opacity-80"
      >
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <Text className="text-sm font-bold text-emerald-700" numberOfLines={1}>{initialsOf(entry.fullName)}</Text>
        </View>
        <Text className="min-w-0 flex-1 text-base font-medium text-slate-900" numberOfLines={1}>
          {entry.fullName}
        </Text>
        <View className="shrink-0 flex-row items-center gap-2">
          <View
            testID={entry.online ? 'presence-online' : 'presence-offline'}
            className={`h-2.5 w-2.5 rounded-full ${entry.online ? 'bg-emerald-500' : 'bg-slate-300'}`}
          />
          <Text className={`text-xs ${entry.online ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}>
            {entry.online ? 'Online' : 'Offline'}
          </Text>
        </View>
      </Pressable>

      {panel === 'menu' ? (
        <View className="flex-row flex-wrap gap-3 border-t border-slate-200 px-4 py-3">
          <ActionButton label="Report" onPress={() => setPanel('report')} />
          <ActionButton label="Block" tone="danger" onPress={() => setPanel('block')} />
        </View>
      ) : null}

      {panel === 'report' ? (
        <View ref={reportFormRef} collapsable={false} className="gap-3 border-t border-slate-200 px-4 py-3">
          <Text className="text-sm font-semibold text-slate-900">Why are you reporting {entry.fullName}?</Text>
          <View className="flex-row flex-wrap gap-2">
            {REPORT_REASONS.map((reason) => {
              const selected = preset === reason;
              return (
                <Pressable
                  key={reason}
                  onPress={() => {
                    setPreset(reason);
                    setFormError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  android_ripple={{ color: 'rgba(15,23,42,0.12)' }}
                  className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-80 ${
                    selected ? 'border-emerald-700 bg-emerald-700' : 'border-slate-300 bg-white'
                  }`}
                >
                  <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-700'}`}>{reason}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={details}
            onChangeText={(text) => {
              setDetails(text);
              setFormError(null);
            }}
            placeholder="Add details (optional)"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={MAX_REPORT_DETAILS_LENGTH}
            accessibilityLabel="Report details"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => Keyboard.dismiss()}
            onFocus={() => scrollIntoView(reportFormRef)}
            autoCapitalize="sentences"
            className="min-h-[88px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          />
          {formError ? <Text accessibilityRole="alert" className="text-sm text-red-700">{formError}</Text> : null}
          {reportMutation.isError ? (
            <Text accessibilityRole="alert" className="text-sm text-red-700">
              {errorMessage(reportMutation.error, 'Could not send the report.')}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-3">
            <ActionButton
              label="Send report"
              tone="primary"
              onPress={submitReport}
              disabled={reportMutation.isPending}
              pending={reportMutation.isPending}
            />
            <ActionButton label="Cancel" onPress={() => setPanel('menu')} disabled={reportMutation.isPending} />
          </View>
        </View>
      ) : null}

      {panel === 'block' ? (
        <View className="gap-3 border-t border-slate-200 px-4 py-3">
          <Text className="text-sm text-slate-700">
            Block {entry.fullName}? You will stop seeing each other in group rosters.
          </Text>
          <View className="flex-row flex-wrap items-center gap-3">
            <ActionButton
              label="Block"
              tone="danger"
              onPress={() => blockMutation.mutate()}
              disabled={blockMutation.isPending}
              pending={blockMutation.isPending}
            />
            <ActionButton label="Cancel" onPress={() => setPanel('menu')} disabled={blockMutation.isPending} />
          </View>
        </View>
      ) : null}

      {panel === 'reported' ? (
        <View className="border-t border-slate-200 px-4 py-3">
          <Text accessibilityRole="alert" className="text-sm font-medium text-emerald-700">Report sent. Thanks for keeping the group safe.</Text>
        </View>
      ) : null}
    </View>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'primary' | 'danger';
  disabled?: boolean;
  pending?: boolean;
};

const BUTTON_STYLES = {
  neutral: { container: 'border-slate-300 bg-white', text: 'text-slate-700' },
  primary: { container: 'border-emerald-700 bg-emerald-700', text: 'text-white' },
  danger: { container: 'border-red-300 bg-white', text: 'text-red-700' },
} as const;

function ActionButton({ label, onPress, tone = 'neutral', disabled = false, pending = false }: ActionButtonProps) {
  const style = BUTTON_STYLES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: pending }}
      android_ripple={{ color: tone === 'primary' ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.12)' }}
      className={`min-h-[44px] min-w-[88px] flex-row items-center justify-center gap-2 rounded-lg border px-4 py-2 active:opacity-80 ${style.container} ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {pending ? <ActivityIndicator size="small" color={tone === 'primary' ? '#FFFFFF' : colors.danger} /> : null}
      <Text className={`text-sm font-semibold ${style.text}`}>{label}</Text>
    </Pressable>
  );
}
