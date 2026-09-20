import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

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

// #B91C1C is 6.4:1 on white and 5.9:1 on the #FEF2F2 panel; #FFFFFF on #B91C1C is 6.4:1. The
// disabled fill #FCA5A5 is never used behind text that has to be read as a label (the label sits
// on it at #7F1D1D, 5.1:1).
const DANGER = '#B91C1C';
const DANGER_DISABLED = '#FCA5A5';
const DANGER_DISABLED_TEXT = '#7F1D1D';
const PANEL_BG = '#FEF2F2';
const PANEL_BORDER = '#FECACA';
const PLACEHOLDER = '#64748B';

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

function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: DANGER, fontSize: 14, lineHeight: 20 }}>•</Text>
      <Text style={{ flex: 1, color: '#334155', fontSize: 14, lineHeight: 20 }}>{children}</Text>
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
      <Text accessibilityRole="text" style={{ fontSize: 14, color: '#334155', lineHeight: 20 }}>
        {ADMIN_MANAGED_NOTE}
      </Text>
    );
  }

  if (done) {
    return (
      <View style={{ gap: 8 }}>
        <Text accessibilityRole="alert" style={{ fontSize: 16, fontWeight: '700', color: '#047857' }}>
          {DELETED_MESSAGE}
        </Text>
        <Text style={{ fontSize: 14, color: '#334155' }}>Taking you back to sign in…</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, color: '#334155' }}>
          Permanently delete your account and personal data. This cannot be undone.
        </Text>
        <Pressable
          onPress={() => {
            setOpen(true);
            onOpen?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          android_ripple={{ color: PANEL_BORDER }}
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DANGER,
            paddingHorizontal: 16,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontWeight: '600', color: DANGER }}>Delete account</Text>
        </Pressable>
      </View>
    );
  }

  const ready = canSubmit({ confirmText, password, busy });
  const showForm = !errorCode || isRetryable(errorCode);

  return (
    <>
      <View
        style={{
          gap: 12,
          padding: 16,
          borderRadius: 12,
          backgroundColor: PANEL_BG,
          borderWidth: 1,
          borderColor: PANEL_BORDER,
        }}
      >
        <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: '#0F172A' }}>
          Delete your account?
        </Text>

        <View style={{ gap: 6 }}>
          {deletionConsequences(role, memberCount).map((line) => (
            <Bullet key={line}>{line}</Bullet>
          ))}
        </View>

        <Text style={{ fontSize: 13, color: '#334155', lineHeight: 19 }}>{STORE_SUBSCRIPTION_NOTE}</Text>

        {showForm ? (
          <>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Your password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                secureTextEntry
                textContentType="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={onFieldFocus}
                onSubmitEditing={() => confirmRef.current?.focus()}
                placeholder="Current password"
                placeholderTextColor={PLACEHOLDER}
                accessibilityLabel="Your password"
                style={{
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: PANEL_BORDER,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 16,
                  color: '#0F172A',
                }}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>
                {`Type ${CONFIRM_WORD} to confirm`}
              </Text>
              <TextInput
                ref={confirmRef}
                value={confirmText}
                onChangeText={setConfirmText}
                editable={!busy}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="done"
                onFocus={onFieldFocus}
                onSubmitEditing={submit}
                placeholder={CONFIRM_WORD}
                placeholderTextColor={PLACEHOLDER}
                accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
                style={{
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: PANEL_BORDER,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 16,
                  color: '#0F172A',
                }}
              />
            </View>
          </>
        ) : null}

        {errorCode ? (
          <Text accessibilityRole="alert" style={{ fontSize: 14, color: DANGER }}>
            {deleteAccountErrorMessage(errorCode)}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={showForm ? 'Cancel' : 'Close'}
            accessibilityState={{ disabled: busy }}
            android_ripple={{ color: '#E2E8F0' }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#94A3B8',
              backgroundColor: '#FFFFFF',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontWeight: '600', color: '#334155' }}>{showForm ? 'Cancel' : 'Close'}</Text>
          </Pressable>

          {showForm ? (
            <Pressable
              onPress={submit}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel="Permanently delete"
              accessibilityState={{ disabled: !ready, busy }}
              android_ripple={{ color: '#FECACA' }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                paddingHorizontal: 12,
                backgroundColor: ready ? DANGER : DANGER_DISABLED,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  numberOfLines={1}
                  style={{ fontWeight: '700', color: ready ? '#FFFFFF' : DANGER_DISABLED_TEXT }}
                >
                  Permanently delete
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );
}
