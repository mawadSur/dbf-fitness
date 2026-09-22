import { View } from 'react-native';

import {
  PRIVACY_URL,
  PROBLEM_BODY,
  PROBLEM_SUBJECT,
  SUPPORT_EMAIL,
  SUPPORT_SUBJECT,
  SUPPORT_URL,
  TERMS_URL,
  supportMailto,
} from '../../config/legal';
import { useTheme } from '../../theme/ThemeProvider';
import { LegalLinkRow } from '../legal/LegalLinkRow';
import { Heading } from '../ui';

/**
 * Legal and support rows on Profile.
 *
 * Both stores require the privacy policy and a support route to be reachable from INSIDE the
 * app, not only from the listing. "Report a problem" is the abuse/report escape hatch Apple
 * guideline 1.2 expects for an app with user-generated content and live video; it opens a
 * prefilled mail so a report arrives with enough context to act on within the 24 hours the
 * terms promise.
 *
 * Every row is a `ListRow` (56 pt, button role, ripple) and degrades to a visible address if
 * the device cannot open the link.
 */
export function LegalSection() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }} testID="legal-section">
      <Heading level={3}>Legal &amp; support</Heading>
      {/* Not a `Card`: every `ListRow` already paints its own surface and 16/12 padding, so a
          padded card would inset the rows and break the full-bleed divider look. This is the
          same rounded, clipped container with no inner padding. */}
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.borderSoft,
        }}
      >
        <LegalLinkRow
          title="Privacy policy"
          subtitle="What DBF Fitness collects and why"
          icon="shield"
          url={PRIVACY_URL}
          target="the privacy policy"
          testID="legal-privacy"
        />
        <LegalLinkRow
          title="Terms of service"
          subtitle="The rules for using DBF Fitness"
          icon="file-text"
          url={TERMS_URL}
          target="the terms of service"
          testID="legal-terms"
        />
        <LegalLinkRow
          title="Help centre"
          subtitle="FAQs and how-to guides"
          icon="info"
          url={SUPPORT_URL}
          target="the support page"
          testID="legal-support"
        />
        <LegalLinkRow
          title="Contact support"
          subtitle={SUPPORT_EMAIL}
          icon="bell"
          url={supportMailto(SUPPORT_SUBJECT)}
          target="your mail app"
          email={SUPPORT_EMAIL}
          testID="legal-contact"
        />
        <LegalLinkRow
          title="Report a problem"
          subtitle="Abuse, unsafe content or a bug"
          icon="alert-triangle"
          url={supportMailto(PROBLEM_SUBJECT, PROBLEM_BODY)}
          target="your mail app"
          email={SUPPORT_EMAIL}
          testID="legal-report"
        />
      </View>
    </View>
  );
}
