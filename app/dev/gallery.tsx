import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Banner,
  Button,
  Card,
  ChecklistRow,
  Chip,
  EmptyState,
  Eyebrow,
  FixedFooter,
  Heading,
  HeroPanel,
  Icon,
  ICON_NAMES,
  Input,
  ListRow,
  Logo,
  MilestoneBadge,
  ProgressRing,
  ScreenHeader,
  ScreenShell,
  SectionHeader,
  Skeleton,
  Text,
  type BannerTone,
  PressableBase,
} from '../../src/components/ui';
import { ExercisePictogram } from '../../src/components/exercises';
import { statusBarStyle } from '../../src/theme/chrome';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Two drawings the resolver knows by name and two it does not. The unknown pair
 * is the point: the fallbacks have to look deliberate next to a real pictogram,
 * not like a missing asset, and that is only visible side by side.
 */
const PICTOGRAM_NAMES = ['Push-up', 'Bodyweight squat', 'Zercher carry', 'Sled push'];

const BANNER_TONES: BannerTone[] = ['success', 'warning', 'danger', 'info'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12, marginTop: 24 }}>
      <SectionHeader title={title} />
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {children}
    </View>
  );
}

/**
 * Developer-only component gallery: every design-system component in every
 * variant and state, with a light/dark toggle, so a later screenshot pass can
 * diff the whole system in two shots.
 *
 * It is not registered in any production navigator and it redirects away when
 * the bundle is not a dev bundle, so a release build cannot reach it.
 */
export default function GalleryScreen() {
  const { scheme, preference, setPreference, colors } = useTheme();
  const [checked, setChecked] = useState(true);
  const [text, setText] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedChip, setSelectedChip] = useState('Strength');
  const [dismissed, setDismissed] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      {/*
       * The root status bar is pinned to the light chrome because the product
       * screens still paint white (src/theme/chrome.ts). This is the one screen
       * that really does paint the dark page, so it owns its own status bar for
       * as long as it is mounted — otherwise dark glyphs would sit on #011A14.
       */}
      <StatusBar style={statusBarStyle(scheme)} />
      <ScreenShell
        testID="gallery"
        header={
          <ScreenHeader
            title="Component gallery"
            eyebrow={`DBF design system · ${scheme}`}
            actions={
              <Button
                label={preference === 'dark' ? 'Light' : 'Dark'}
                variant="secondary"
                size="sm"
                leadingIcon={preference === 'dark' ? 'sun' : 'moon'}
                onPress={() => setPreference(preference === 'dark' ? 'light' : 'dark')}
                testID="gallery-theme-toggle"
              />
            }
          />
        }
        footer={
          <FixedFooter>
            <Button label="Primary action" fullWidth onPress={() => undefined} />
          </FixedFooter>
        }
      >
        <Section title="Logo">
          <Row>
            <Logo height={48} />
            <Logo height={48} badge="always" />
          </Row>
        </Section>

        <Section title="Typography">
          <Eyebrow>Eyebrow</Eyebrow>
          <Heading level="display">Display 40</Heading>
          <Heading level={1}>Heading 1</Heading>
          <Heading level={2}>Heading 2</Heading>
          <Heading level={3}>Heading 3</Heading>
          <Text role="bodyLg">Body large 17</Text>
          <Text role="body">Body 16</Text>
          <Text role="bodySm" tone="muted">
            Body small 14, muted
          </Text>
          <Text role="caption" tone="secondary">
            Caption 12, secondary
          </Text>
        </Section>

        <Section title={`Icons (${ICON_NAMES.length})`}>
          <Row>
            {ICON_NAMES.map((name) => (
              <View key={name} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={name} size={24} color={colors.text} />
              </View>
            ))}
          </Row>
        </Section>

        <Section title="Buttons">
          <Row>
            <Button label="Primary" onPress={() => undefined} />
            <Button label="Secondary" variant="secondary" onPress={() => undefined} />
            <Button label="Ghost" variant="ghost" onPress={() => undefined} />
            <Button label="Danger" variant="danger" onPress={() => undefined} />
          </Row>
          <Row>
            <Button label="Small" size="sm" onPress={() => undefined} />
            <Button label="Medium" size="md" onPress={() => undefined} />
            <Button label="Large" size="lg" onPress={() => undefined} />
          </Row>
          <Row>
            <Button label="Loading" loading onPress={() => undefined} />
            <Button label="Disabled" disabled onPress={() => undefined} />
            <Button label="With icons" leadingIcon="plus" trailingIcon="arrow-right" onPress={() => undefined} />
          </Row>
          <Button label="Full width" fullWidth onPress={() => undefined} />
        </Section>

        <Section title="Cards & hero">
          <Card>
            <Text>Card · surface</Text>
          </Card>
          <Card tone="raised" padding={24}>
            <Text>Card · raised, padding 24</Text>
          </Card>
          <Card tone="soft" onPress={() => undefined} accessibilityLabel="Pressable card">
            <Text>Card · soft, pressable</Text>
          </Card>
          <HeroPanel>
            <Eyebrow>Today</Eyebrow>
            <Heading level={2}>Transform Your Body &amp; Mind</Heading>
          </HeroPanel>
        </Section>

        <Section title="Chips & badges">
          <Row>
            {['Strength', 'Cardio', 'Mobility'].map((label) => (
              <Chip
                key={label}
                label={label}
                selected={selectedChip === label}
                onPress={() => setSelectedChip(label)}
              />
            ))}
            <Chip label="Disabled" disabled onPress={() => undefined} />
            <Chip label="Static" />
          </Row>
          <Row>
            <Badge label="Neutral" />
            <Badge label="Brand" tone="brand" icon="crown" />
            <Badge label="Active" tone="success" icon="check-circle" />
            <Badge label="Grace" tone="warning" icon="clock" />
            <Badge label="Expired" tone="danger" icon="alert-triangle" />
            <Badge label="Info" tone="info" icon="info" />
          </Row>
          <Row>
            <MilestoneBadge title="First day" caption="Day 1" icon="flame" tone="brand" />
            <MilestoneBadge title="7-day streak" caption="One week" icon="trophy" tone="success" />
            <MilestoneBadge title="30-day streak" caption="One month" icon="crown" tone="warning" earned={false} />
          </Row>
        </Section>

        <Section title="Rows">
          <ListRow title="List row" subtitle="With subtitle and chevron" icon="calendar" onPress={() => undefined} />
          <ListRow title="Static row" subtitle="No press target" icon="clock" />
          <ListRow title="Disabled row" icon="lock" disabled onPress={() => undefined} />
          <ChecklistRow label="Back squat" sublabel="3 × 10" checked={checked} onToggle={() => setChecked((v) => !v)} />
          <ChecklistRow label="Unchecked item" checked={false} onToggle={() => undefined} onPress={() => undefined} />
          <ChecklistRow label="Disabled item" checked={false} onToggle={() => undefined} disabled />
        </Section>

        <Section title="Inputs">
          <Input label="Email" value={text} onChangeText={setText} placeholder="you@example.com" keyboardType="email-address" helperText="We never share it." />
          <Input label="Password" value={secret} onChangeText={setSecret} secureTextEntry required />
          <Input label="With error" value="nope" onChangeText={() => undefined} error="Enter a valid email address." />
          <Input label="Disabled" value="Read only" onChangeText={() => undefined} disabled />
          <Input label="Notes" value="" onChangeText={() => undefined} multiline placeholder="How did it go?" />
        </Section>

        <Section title="Progress">
          <Row>
            <ProgressRing value={5} max={30} label="Day streak" />
            <ProgressRing value={30} max={30} label="Complete" size={96} />
            <ProgressRing value={0} max={30} label="Not started" size={72} animate={false} />
          </Row>
        </Section>

        <Section title="Exercise pictograms">
          <Text role="bodySm" tone="muted">
            Thumbs — the last two names are unknown, so they fall back by category.
          </Text>
          <Row>
            {PICTOGRAM_NAMES.map((name) => (
              <View key={name} style={{ alignItems: 'center', gap: 4, width: 96 }}>
                <ExercisePictogram name={name} variant="thumb" />
                <Text role="caption" tone="muted" align="center">
                  {name}
                </Text>
              </View>
            ))}
          </Row>
          <Text role="bodySm" tone="muted">
            Hero — a known drawing and a fallback.
          </Text>
          <ExercisePictogram name="Push-up" variant="hero" />
          <ExercisePictogram name="Sled push" variant="hero" />
        </Section>

        <Section title="PressableBase">
          <Text role="bodySm" tone="muted">
            The press primitive under Button/Card/ListRow — box styles on a static
            object so Android keeps them, feedback computed per press.
          </Text>
          <Row>
            <PressableBase
              accessibilityRole="button"
              onPress={() => undefined}
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.borderSoft,
                backgroundColor: colors.surface,
              }}
            >
              <Text>Default feedback</Text>
            </PressableBase>
            <PressableBase
              accessibilityRole="button"
              onPress={() => undefined}
              pressFeedback="none"
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.borderSoft,
                backgroundColor: colors.surface,
              }}
            >
              <Text>No feedback</Text>
            </PressableBase>
          </Row>
        </Section>

        <Section title="Feedback">
          {BANNER_TONES.map((tone) => (
            <Banner key={tone} tone={tone} title={`${tone} banner`} message="Something happened worth saying." />
          ))}
          {dismissed ? null : (
            <Banner
              tone="warning"
              title="Dismissible"
              message="Payment is late — 7 days of grace left."
              onDismiss={() => setDismissed(true)}
            />
          )}
          <Skeleton height={20} />
          <Skeleton height={20} width="60%" />
          <Skeleton height={56} radius={12} />
          <EmptyState
            icon="file-text"
            title="No notes yet"
            message="Upload a recording and the notes will show up here."
            actionLabel="Upload a recording"
            onAction={() => undefined}
          />
        </Section>
      </ScreenShell>
    </>
  );
}
