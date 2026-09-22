import { Platform, Pressable, View } from 'react-native';

import { PRIVACY_URL, TERMS_URL } from '../../config/legal';
// `useOptionalTheme`, not `useTheme`: this is a shared component that also renders on the
// unauthenticated sign-up screen and in unit tests, which mount outside the provider.
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Text } from '../ui';
import { LegalTextLink } from './LegalTextLink';

/** The box glyph itself. The row around it is what carries the 44 pt target. */
const BOX_SIZE = 24;

/**
 * The 44 pt target's geometry, hoisted out of the pressed callback. A function-form style that
 * returns layout keys re-runs layout on every press rather than just repainting, which
 * `pressableSourceGuard` fails the build over. Only `opacity` stays dynamic.
 *
 * The negative margins let the 44 pt target overhang the 24 pt box without pushing the
 * sentence beside it out of alignment.
 */
const TARGET_LAYOUT = {
  width: 44,
  height: 44,
  marginLeft: -10,
  marginTop: -10,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export type TermsCheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Turns the row red once the user has tried to submit without agreeing. */
  showError?: boolean;
  testID?: string;
};

/**
 * The required "I agree" control on sign-up.
 *
 * Apple guideline 1.2 expects an app with user-generated content to have every user AGREE to
 * terms that forbid objectionable content — a passive "by signing up you accept" line is the
 * usual reason this is cited. So the box starts unchecked, the submit button stays disabled
 * until it is ticked, and the acceptance is recorded server-side by `accept_terms`.
 *
 * The two document links are separate `LegalTextLink` pressables rather than tappable spans
 * inside the sentence: nested tappable text does not get its own accessibility node on
 * Android, and a reviewer who cannot open the terms from the sign-up screen files a rejection.
 */
export function TermsCheckbox({
  checked,
  onChange,
  showError = false,
  testID = 'terms-checkbox',
}: TermsCheckboxProps) {
  const { colors } = useOptionalTheme();
  const borderColor =
    showError && !checked ? colors.danger : checked ? colors.brand : colors.borderStrong;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Pressable
          onPress={() => onChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          hitSlop={10}
          android_ripple={
            Platform.OS === 'android' ? { color: 'rgba(5,150,105,0.18)', borderless: true } : undefined
          }
          style={({ pressed }) => [TARGET_LAYOUT, { opacity: pressed ? 0.7 : 1 }]}
          testID={testID}
        >
          <View
            style={{
              width: BOX_SIZE,
              height: BOX_SIZE,
              borderRadius: 6,
              borderWidth: 2,
              borderColor,
              backgroundColor: checked ? colors.brand : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* The icon set has no bare tick, so the checkmark is two rotated bars — no new
                dependency and it scales with the box. */}
            {checked ? (
              <View
                style={{
                  width: 12,
                  height: 6,
                  borderLeftWidth: 2,
                  borderBottomWidth: 2,
                  borderColor: colors.onCta,
                  transform: [{ rotate: '-45deg' }],
                  marginTop: -3,
                }}
              />
            ) : null}
          </View>
        </Pressable>

        {/* The sentence wraps around the two links; `flex: 1` keeps it inside the screen at
            360 pt and at 200% font scale instead of pushing the links off the edge. */}
        <View
          style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 2 }}
        >
          <Text role="bodySm" tone="secondary">
            I agree to the{' '}
          </Text>
          <LegalTextLink
            label="Terms of Service"
            url={TERMS_URL}
            target="the terms of service"
            testID={`${testID}-terms-link`}
          />
          <Text role="bodySm" tone="secondary">
            {' '}
            and{' '}
          </Text>
          <LegalTextLink
            label="Privacy Policy"
            url={PRIVACY_URL}
            target="the privacy policy"
            testID={`${testID}-privacy-link`}
          />
        </View>
      </View>

      {showError && !checked ? (
        <Text role="bodySm" tone="danger" testID={`${testID}-error`}>
          Please agree to the Terms of Service and Privacy Policy to continue.
        </Text>
      ) : null}
    </View>
  );
}
