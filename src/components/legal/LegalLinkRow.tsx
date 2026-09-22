import { useState } from 'react';
import { View } from 'react-native';

import { Icon, ListRow, Text } from '../ui';
import type { IconName } from '../ui';
import { couldNotOpenMailMessage, couldNotOpenMessage, openExternal } from './openExternal';

export type LegalLinkRowProps = {
  title: string;
  subtitle?: string;
  icon: IconName;
  /** Full URL — `https:` or `mailto:`. */
  url: string;
  /** What to name in the failure message, e.g. "the privacy policy". */
  target: string;
  /** For a `mailto:`, the address to show if no mail app exists. */
  email?: string;
  testID?: string;
};

/**
 * One row of the legal / support list.
 *
 * `ListRow` already gives a 56 pt target (> the 44 pt minimum), a button role, a label and a
 * ripple. What this adds is the FAILURE path: a tap that cannot open anything leaves an inline
 * message with the address instead of doing nothing, so the information is still reachable on a
 * device with no mail client — which is exactly the device a store reviewer uses.
 */
export function LegalLinkRow({
  title,
  subtitle,
  icon,
  url,
  target,
  email,
  testID,
}: LegalLinkRowProps) {
  const [failed, setFailed] = useState(false);

  const onPress = () => {
    void (async () => {
      const ok = await openExternal(url);
      setFailed(!ok);
    })();
  };

  return (
    <View>
      <ListRow
        title={title}
        subtitle={subtitle}
        icon={icon}
        onPress={onPress}
        showChevron={false}
        trailing={<Icon name="external-link" size={16} />}
        accessibilityLabel={title}
        accessibilityHint={
          url.startsWith('mailto:') ? 'Opens your mail app' : 'Opens in your browser'
        }
        testID={testID}
      />
      {failed ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Text role="bodySm" tone="danger" testID={testID ? `${testID}-error` : undefined}>
            {email ? couldNotOpenMailMessage(email) : couldNotOpenMessage(target)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
