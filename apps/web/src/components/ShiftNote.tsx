import { Field, inputClass } from './ui';

/// The most a shift's note can hold — the server's limit too.
export const SHIFT_NOTE_MAX = 500;

/**
 * The note box on the shift forms (Dominguez, October 2026: "so I can write
 * 7–12 upstairs and 12–3 downstairs"). The person on the shift sees it on
 * their schedule and Home, and it goes on the printed rota and their calendar.
 */
export function ShiftNoteField({
  value,
  onChange,
  label = 'Notes (optional)',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <Field
      label={label}
      hint="For example: 7–12 upstairs, 12–3 downstairs. The person on the shift sees it; it is on the printed rota too."
    >
      {(props) => (
        <textarea
          {...props}
          rows={2}
          maxLength={SHIFT_NOTE_MAX}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
          data-testid="shift-note-input"
        />
      )}
    </Field>
  );
}

/// What to send for a note box: its words, or null for nothing.
export function noteToSend(value: string): string | null {
  return value.trim() || null;
}
