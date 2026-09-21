import { fireEvent, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import type { NoteChecklistItem } from '../../services/transcription/types';
import { mockWindowDimensions, renderInTheme } from '../ui/testing';
import { ChecklistEditorRow } from './ChecklistEditorRow';

afterEach(() => jest.restoreAllMocks());

const EXERCISE: NoteChecklistItem = { key: 'k1', kind: 'exercise', text: 'Back squat', sets: 4, reps: '8-10' };
const NOTE: NoteChecklistItem = { key: 'k2', kind: 'note', text: 'Keep the core braced' };

function row(item: NoteChecklistItem, index: number, count: number, dispatch = jest.fn(), disabled = false) {
  return (
    <ChecklistEditorRow item={item} index={index} count={count} dispatch={dispatch} disabled={disabled} />
  );
}

describe('ChecklistEditorRow', () => {
  it('names every field by its position so a coach knows which row has focus', async () => {
    await renderInTheme(row(EXERCISE, 1, 3));
    expect((await screen.findByLabelText('Text for item 2')).props.value).toBe('Back squat');
    expect(screen.getByLabelText('Sets for item 2').props.value).toBe('4');
    expect(screen.getByLabelText('Reps for item 2').props.value).toBe('8-10');
  });

  it('hides sets and reps on a note, which has neither', async () => {
    await renderInTheme(row(NOTE, 0, 2));
    expect(await screen.findByLabelText('Text for item 1')).toBeTruthy();
    expect(screen.queryByLabelText('Sets for item 1')).toBeNull();
    expect(screen.queryByLabelText('Reps for item 1')).toBeNull();
  });

  it('edits, reorders, retypes and deletes through the reducer', async () => {
    const dispatch = jest.fn();
    await renderInTheme(row(EXERCISE, 1, 3, dispatch));

    await fireEvent.changeText(await screen.findByLabelText('Text for item 2'), 'Front squat');
    expect(dispatch).toHaveBeenCalledWith({ type: 'setText', key: 'k1', text: 'Front squat' });

    await fireEvent.press(screen.getByLabelText('Move item 2 up'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'move', key: 'k1', direction: -1 });

    await fireEvent.press(screen.getByLabelText('Move item 2 down'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'move', key: 'k1', direction: 1 });

    await fireEvent.press(screen.getByLabelText('Exercise'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'toggleKind', key: 'k1' });

    await fireEvent.press(screen.getByLabelText('Delete item 2'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'delete', key: 'k1' });
  });

  it('cannot move the first row up or the last row down', async () => {
    await renderInTheme(row(EXERCISE, 0, 1));
    expect((await screen.findByLabelText('Move item 1 up')).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Move item 1 down').props.accessibilityState.disabled).toBe(true);
  });

  it('disables every control while a save is in flight', async () => {
    const dispatch = jest.fn();
    await renderInTheme(row(EXERCISE, 1, 3, dispatch, true));
    const text = await screen.findByLabelText('Text for item 2');
    expect(text.props.editable).toBe(false);
    expect(screen.getByLabelText('Delete item 2').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Delete item 2'));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps the three controls in a row at normal text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    await renderInTheme(row(EXERCISE, 1, 3));
    expect((await screen.findByTestId('editor-row-controls-1')).props.style.flexDirection).toBe('row');
  });

  it('stacks the controls at 200% text so no reorder arrow clips', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    mockWindowDimensions({ width: 360, height: 640, fontScale: 2 });
    await renderInTheme(row(EXERCISE, 1, 3));
    expect((await screen.findByTestId('editor-row-controls-1')).props.style.flexDirection).toBe('column');
    // Everything is still reachable, just one per line.
    expect(screen.getByLabelText('Move item 2 up')).toBeTruthy();
    expect(screen.getByLabelText('Sets for item 2')).toBeTruthy();
  });
});
