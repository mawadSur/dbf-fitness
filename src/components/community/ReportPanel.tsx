import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';

import { reportUser } from '../../features/community/api';
import {
  buildReportReason,
  MAX_REPORT_DETAILS_LENGTH,
  REPORT_REASONS,
  type ReportReason,
} from '../../features/community/reportReasons';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Banner, Button, Chip, Input, Text } from '../ui';
import { useScrollIntoView } from './ScrollIntoView';

/** What reporting actually does, in plain words, so nobody has to guess. */
export const REPORT_SAFETY_COPY =
  'Your coach reviews reports and decides what happens next. The person you report is never told who reported them.';

/** The one error that belongs above the reason chips rather than under the details field. */
const PICK_A_REASON = 'Pick a reason.';

type ReportPanelProps = {
  memberId: string;
  fullName: string;
  onSent: () => void;
  onCancel: () => void;
};

/** Inline report form: reason chips, optional details, validation, plain safety copy. */
export function ReportPanel({ memberId, fullName, onSent, onCancel }: ReportPanelProps) {
  const { tokens } = useOptionalTheme();
  const [preset, setPreset] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const scrollIntoView = useScrollIntoView();
  const formRef = useRef<View>(null);

  const mutation = useMutation({
    mutationFn: (reason: string) => reportUser(memberId, reason),
    onSuccess: onSent,
  });

  // The form opens below the fold on a phone: lift it above the keyboard straight away.
  useEffect(() => {
    scrollIntoView(formRef);
  }, [scrollIntoView]);

  const submit = () => {
    Keyboard.dismiss();
    const result = buildReportReason(preset, details);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormError(null);
    mutation.mutate(result.reason);
  };

  const detailsError = formError && formError !== PICK_A_REASON ? formError : undefined;

  return (
    <View ref={formRef} collapsable={false} style={{ gap: tokens.space.md }}>
      <Text role="labelSm">Why are you reporting {fullName}?</Text>

      {formError === PICK_A_REASON ? <Banner tone="danger" title={PICK_A_REASON} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
        {REPORT_REASONS.map((reason) => (
          <Chip
            key={reason}
            testID={`report-reason-${reason}`}
            label={reason}
            selected={preset === reason}
            onPress={() => {
              setPreset(reason);
              setFormError(null);
            }}
          />
        ))}
      </View>

      <Input
        testID="report-details"
        label="Details (optional)"
        value={details}
        onChangeText={(next) => {
          setDetails(next);
          setFormError(null);
        }}
        placeholder="What happened?"
        helperText={`Up to ${MAX_REPORT_DETAILS_LENGTH} characters.`}
        error={detailsError}
        multiline
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
      />

      <Text role="bodySm" tone="muted">
        {REPORT_SAFETY_COPY}
      </Text>

      {mutation.isError ? (
        <Banner
          tone="danger"
          title="Report not sent"
          message={friendlyErrorMessage(mutation.error, 'Could not send the report.')}
        />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
        <Button
          label="Send report"
          onPress={submit}
          loading={mutation.isPending}
          accessibilityLabel="Send report"
        />
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onCancel}
          disabled={mutation.isPending}
          accessibilityLabel="Cancel report"
        />
      </View>
    </View>
  );
}
