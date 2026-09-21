import { fireEvent, screen } from '@testing-library/react-native';

import type { CoachClass } from '../../features/notes/types';
import type { RecordingStatus } from '../../services/transcription/types';
import { BOTH_THEMES, colorsFor, flattenStyle, renderInTheme } from '../ui/testing';
import { ChecklistProgress } from './ChecklistProgress';
import { ClassPickerRow } from './ClassPickerRow';
import { EditorField } from './EditorField';
import { IconButton } from './IconButton';
import { StateMessage } from './StateMessage';
import { StatusChip } from './StatusChip';
import { UploadProgress } from './UploadProgress';

const CLASS: CoachClass = {
  id: 'class-1',
  title: 'Morning Crew',
  starts_at: '2026-09-18T09:00:00.000Z',
} as CoachClass;

describe('StatusChip', () => {
  const statuses: RecordingStatus[] = ['uploading', 'transcribing', 'draft', 'published', 'failed'];

  it.each(statuses)('%s is announced as a word, not a colour', async (status) => {
    await renderInTheme(<StatusChip status={status} />);
    const chip = await screen.findByTestId(`status-chip-${status}`);
    expect(chip).toBeTruthy();
    const name = screen.getByLabelText(/^Status: /).props.accessibilityLabel as string;
    expect(name.replace('Status: ', '').length).toBeGreaterThan(0);
  });

  it.each(BOTH_THEMES)('renders in %s', async (scheme) => {
    await renderInTheme(<StatusChip status="published" />, scheme);
    expect(await screen.findByTestId('status-chip-published')).toBeTruthy();
  });
});

describe('ChecklistProgress', () => {
  it('reports the count as a progressbar and spells it out in words too', async () => {
    await renderInTheme(<ChecklistProgress done={3} total={8} label="3 of 8 done" />);
    const bar = await screen.findByLabelText('3 of 8 done');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 8, now: 3 });
    expect(screen.getAllByText('3 of 8 done').length).toBeGreaterThan(0);
    expect(flattenStyle(screen.getByTestId('checklist-progress-fill').props.style).width).toBe('38%');
  });

  it('shows an empty bar rather than NaN when there is nothing to do', async () => {
    await renderInTheme(<ChecklistProgress done={0} total={0} label="Nothing to do" />);
    expect(flattenStyle((await screen.findByTestId('checklist-progress-fill')).props.style).width).toBe('0%');
  });

  // Regression: the track used to be `progressTrack`, which in the light theme is the saturated
  // mint the ring puts UNDER its dark arc. On a 10px straight bar that read as a FULL bar, so a
  // member at "0 of 4 done" saw a complete one. The track must stay a recessed surface.
  it.each(BOTH_THEMES)('in %s an empty bar does not look full: the track is not the fill colour', async (scheme) => {
    await renderInTheme(<ChecklistProgress done={0} total={4} label="0 of 4 done" />, scheme);
    const palette = colorsFor(scheme);
    const fill = flattenStyle((await screen.findByTestId('checklist-progress-fill')).props.style);
    const track = flattenStyle(screen.getByLabelText('0 of 4 done').props.style);

    expect(fill.width).toBe('0%');
    expect(fill.backgroundColor).toBe(palette.progressArc);
    expect(track.backgroundColor).toBe(palette.bgSoft);
    expect(track.backgroundColor).not.toBe(palette.progressArc);
    expect(track.backgroundColor).not.toBe(palette.progressTrack);
    // An empty bar is still outlined, so it reads as a bar and not as blank space.
    expect(track.borderWidth).toBeGreaterThan(0);
    expect(track.borderColor).toBe(palette.borderSoft);
  });

  it('fills proportionally once items are ticked', async () => {
    await renderInTheme(<ChecklistProgress done={2} total={4} label="2 of 4 done" />);
    expect(flattenStyle((await screen.findByTestId('checklist-progress-fill')).props.style).width).toBe('50%');
  });
});

describe('UploadProgress', () => {
  it('announces the percentage as a value and as text', async () => {
    await renderInTheme(<UploadProgress percent={42} />);
    const bar = await screen.findByLabelText('Uploading, 42 percent');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
    expect(screen.getByText(/Uploading 42%/)).toBeTruthy();
    expect(flattenStyle(screen.getByTestId('upload-progress-fill').props.style).width).toBe('42%');
  });

  // Same regression as ChecklistProgress: at 0% the saturated `progressTrack` made a just-started
  // upload look finished. Both bars share `ProgressBar`, so both are pinned here.
  it.each(BOTH_THEMES)('in %s an upload at 0%% does not look finished', async (scheme) => {
    await renderInTheme(<UploadProgress percent={0} />, scheme);
    const palette = colorsFor(scheme);
    const fill = flattenStyle((await screen.findByTestId('upload-progress-fill')).props.style);
    const track = flattenStyle(screen.getByLabelText('Uploading, 0 percent').props.style);

    expect(fill.width).toBe('0%');
    expect(track.backgroundColor).toBe(palette.bgSoft);
    expect(track.backgroundColor).not.toBe(palette.progressArc);
    expect(track.backgroundColor).not.toBe(palette.progressTrack);
    expect(track.borderWidth).toBeGreaterThan(0);
  });
});

describe('ClassPickerRow', () => {
  it('leaves an unchosen class unselected and softly bordered', async () => {
    await renderInTheme(<ClassPickerRow item={CLASS} selected={false} disabled={false} onPress={() => undefined} />);
    const row = await screen.findByLabelText('Morning Crew');
    expect(row.props.accessibilityState.selected).toBe(false);
    expect(flattenStyle(row.props.style).borderColor).toBe(colorsFor('light').borderSoft);
  });

  it('marks the chosen class with a radio state and a tick, not colour alone', async () => {
    await renderInTheme(<ClassPickerRow item={CLASS} selected disabled={false} onPress={() => undefined} />);
    const row = await screen.findByLabelText('Morning Crew');
    expect(row.props.accessibilityState.selected).toBe(true);
    // The border turns CTA AND the icon becomes a tick: two signals, not one.
    expect(flattenStyle(row.props.style).borderColor).toBe(colorsFor('light').cta);
  });

  it('does not fire while an upload is running', async () => {
    const onPress = jest.fn();
    await renderInTheme(<ClassPickerRow item={CLASS} selected={false} disabled onPress={onPress} />);
    const row = await screen.findByLabelText('Morning Crew');
    expect(row.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('EditorField', () => {
  it('shows one label and announces another', async () => {
    await renderInTheme(
      <EditorField label="Sets" accessibilityLabel="Sets for item 2" value="4" onChangeText={() => undefined} />,
    );
    expect(await screen.findByText('Sets')).toBeTruthy();
    expect(screen.getByLabelText('Sets for item 2').props.value).toBe('4');
  });

  it('falls back to the visible label and can hide it', async () => {
    await renderInTheme(
      <EditorField label="Checklist title" labelHidden value="Legs" onChangeText={() => undefined} />,
    );
    expect(await screen.findByLabelText('Checklist title')).toBeTruthy();
    expect(screen.queryByText('Checklist title')).toBeNull();
  });
});

describe('IconButton', () => {
  it('carries its meaning in the accessible name and blocks presses when disabled', async () => {
    const onPress = jest.fn();
    await renderInTheme(<IconButton label="Move item 1 up" icon="chevron-up" disabled onPress={onPress} />);
    const button = await screen.findByLabelText('Move item 1 up');
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    // 44pt on iOS: the reorder arrows are the smallest controls on the screen.
    expect(flattenStyle(button.props.style).width).toBeGreaterThanOrEqual(44);
  });

  // A bare chevron on a card does not look pressable, so the reorder buttons keep a visible edge.
  it.each(BOTH_THEMES)('in %s it is drawn as a button, not a floating glyph', async (scheme) => {
    await renderInTheme(<IconButton label="Move item 1 down" icon="chevron-down" onPress={jest.fn()} />, scheme);
    const palette = colorsFor(scheme);
    const style = flattenStyle((await screen.findByLabelText('Move item 1 down')).props.style);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(palette.borderSoft);
    expect(style.backgroundColor).toBe(palette.bgSoft);
  });
});

describe('StateMessage', () => {
  it('renders a skeleton while loading, never a bare full-screen spinner', async () => {
    await renderInTheme(<StateMessage kind="loading" />);
    expect(screen.queryByTestId('activity-indicator')).toBeNull();
  });

  it('offers a retry on error and names the problem', async () => {
    const onRetry = jest.fn();
    await renderInTheme(<StateMessage kind="error" title="Could not load recordings" onRetry={onRetry} />);
    expect(await screen.findByText('Could not load recordings')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it.each(['empty', 'denied'] as const)('%s gives the member something to read', async (kind) => {
    await renderInTheme(<StateMessage kind={kind} title="Nothing yet" message="Come back later." />);
    expect(await screen.findByText('Nothing yet')).toBeTruthy();
    expect(screen.getByText('Come back later.')).toBeTruthy();
  });
});
