import { useRef, useState } from 'react';
import { Keyboard, type TextInput, View } from 'react-native';

import {
  ADMIN_MANAGED_NOTE,
  CONFIRM_WORD,
  DELETED_MESSAGE,
  STORE_SUBSCRIPTION_NOTE,
  canSubmit,
  deleteAccountErrorMessage,
  deletionConsequences,
  isRetryable,
  type AccountRole,
} from '../../features/account/deleteAccount';
import type { DeleteAccountErrorCode } from '../../features/account/api';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Button, Card, Heading, Icon, Text } from '../ui';
import { PanelInput } from './PanelInput';

export type DeleteAccountPanelProps = {
  role: AccountRole;
  /** Null when the count is unknown; the copy falls back to "Your members". */
  memberCount: number | null;
  /** Resolves when the account is gone; rejects with a DeleteAccountError. */
  onDelete: (password: string) => Promise<void>;
  /** Sign out, clear the cache and leave for sign-in. Called only after a successful delete. */
  onDeleted: () => void;
  /** Fired when the panel is expanded, so the parent can fetch the member count lazily. */
  onOpen?: () => void;
  /**
   * Fired when a form field takes focus. The Profile screen owns the single keyboard-avoiding
   * container and the ScrollView, so it scrolls the focused field into view; the panel must not
   * nest its own KeyboardAvoidingView inside that ScrollView.
   */
  onFieldFocus?: () => void;
};

/** One consequence of deleting, marked with the danger icon rather than a bare bullet glyph. */
function Consequence({ children }: { children: string }) {
  const { colors } = useOptionalTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name="minus" size={16} color={colors.danger} />
      </View>
      <Text role="bodySm" tone="secondary" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The Profile tab's danger zone: an INLINE expanding panel (never Alert.alert, which silently
 * no-ops on RN-web for multi-button flows) that states what deletion destroys for THIS role,
 * warns that a store subscription keeps billing, and demands both the password and the typed word
 * DELETE before it will fire.
 *
 * Collapsed is the default and is completely inert — nothing is fetched or called until the user
 * opens it.
 */
export function DeleteAccountPanel({ role, memberCount, onDelete, onDeleted, onOpen, onFieldFocus }: DeleteAccountPanelProps) {
  const confirmRef = useRef<TextInput>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<DeleteAccountErrorCode | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirmText('');
    setErrorCode(null);
  };

  const submit = async () => {
    if (!canSubmit({ confirmText, password, busy })) return;
    Keyboard.dismiss();
    setBusy(true);
    setErrorCode(null);
    try {
      await onDelete(password);
      // Wipe the password out of state the moment it is no longer needed, then show the
      // confirmation before handing off to the sign-out + navigation the parent owns.
      setPassword('');
      setConfirmText('');
      setDone(true);
      onDeleted();
    } catch (error) {
      const code = (error as { code?: DeleteAccountErrorCode } | null)?.code;
      setErrorCode(code ?? 'unknown');
    } finally {
      setBusy(false);
    }
  };

  if (role === 'admin') {
    return (
      <Text role="bodySm" tone="secondary">
        {ADMIN_MANAGED_NOTE}
      </Text>
    );
  }

  if (done) {
    return (
      <View style={{ gap: 8 }}>
        <Banner tone="success" title={DELETED_MESSAGE} message="Taking you back to sign in…" />
      </View>
    );
  }

  if (!open) {
    return (
      <View style={{ gap: 12 }}>
        {/* The section subtitle above already warns that deletion is permanent, so this line says
            WHAT goes instead of repeating "cannot be undone" two lines apart. */}
        <Text role="bodySm" tone="secondary">
          Your profile, workouts, notes and messages are removed with it.
        </Text>
        {/* `danger-outline`, not `secondary`: in the danger zone this button sat
            directly under "Sign out" and "Change coach" with the SAME neutral
            outline and the same text colour, so the only thing separating an
            irreversible delete from a benign sign-out was a trash glyph. */}
        <Button
          label="Delete account"
          variant="danger-outline"
          leadingIcon="trash"
          onPress={() => {
            setOpen(true);
            onOpen?.();
          }}
          fullWidth
        />
      </View>
    );
  }

  const ready = canSubmit({ confirmText, password, busy });
  const showForm = !errorCode || isRetryable(errorCode);

  return (
    <Card padding={16} tone="soft" testID="delete-account-panel">
      <View style={{ gap: 12 }}>
        <Heading level={3}>Delete your account?</Heading>

        <View style={{ gap: 6 }}>
          {deletionConsequences(role, memberCount).map((line) => (
            <Consequence key={line}>{line}</Consequence>
          ))}
        </View>

        <Text role="caption" tone="secondary">
          {STORE_SUBSCRIPTION_NOTE}
        </Text>

        {showForm ? (
          <>
            <PanelInput
              label="Your password"
              value={password}
              onChangeText={setPassword}
              disabled={busy}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              autoCapitalize="none"
              returnKeyType="next"
              onFocus={onFieldFocus}
              onSubmitEditing={() => confirmRef.current?.focus()}
              placeholder="Current password"
            />
            <PanelInput
              label={`Type ${CONFIRM_WORD} to confirm`}
              value={confirmText}
              onChangeText={setConfirmText}
              inputRef={confirmRef}
              disabled={busy}
              autoCapitalize="characters"
              autoComplete="off"
              returnKeyType="done"
              onFocus={onFieldFocus}
              onSubmitEditing={submit}
              placeholder={CONFIRM_WORD}
            />
          </>
        ) : null}

        {errorCode ? <Banner tone="danger" title={deleteAccountErrorMessage(errorCode)} /> : null}

        {/* Stacked, with the destructive action FIRST only once it is actually armed: at 200% text
            a side-by-side pair clips, and "Permanently delete" is too long to share a row. */}
        {showForm ? (
          <Button
            label="Permanently delete"
            variant="danger"
            onPress={submit}
            disabled={!ready}
            loading={busy}
            fullWidth
          />
        ) : null}
        <Button
          label={showForm ? 'Cancel' : 'Close'}
          variant="ghost"
          onPress={close}
          disabled={busy}
          fullWidth
        />
      </View>
    </Card>
  );
}
