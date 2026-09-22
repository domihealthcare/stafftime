interface KeypadProps {
  length: number;
  maxLength: number;
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A touch keypad sized for a tablet at arm's length on a busy front desk.
 *
 * Buttons are large and spaced so a hurried tap does not land on a neighbour,
 * and entered digits are shown only as dots — someone standing behind you can
 * see the screen.
 */
export function Keypad({
  length,
  maxLength,
  disabled = false,
  onDigit,
  onBackspace,
  onSubmit,
}: KeypadProps) {
  const buttonClass =
    'flex h-20 items-center justify-center rounded-2xl text-3xl font-medium transition active:scale-95 disabled:opacity-40';

  return (
    <div className="w-full">
      <div
        className="mb-6 flex h-12 items-center justify-center gap-3"
        aria-live="polite"
        aria-label={`${length} of ${maxLength} digits entered`}
      >
        {Array.from({ length: maxLength }, (_, index) => (
          <span
            key={index}
            className={`h-4 w-4 rounded-full transition ${
              index < length ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled || length >= maxLength}
            onClick={() => onDigit(digit)}
            className={`${buttonClass} bg-white text-slate-900 shadow-sm hover:bg-slate-50`}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled || length === 0}
          onClick={onBackspace}
          className={`${buttonClass} bg-slate-200 text-slate-700 hover:bg-slate-300`}
          aria-label="Delete last digit"
        >
          ←
        </button>

        <button
          type="button"
          disabled={disabled || length >= maxLength}
          onClick={() => onDigit('0')}
          className={`${buttonClass} bg-white text-slate-900 shadow-sm hover:bg-slate-50`}
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || length < 4}
          onClick={onSubmit}
          className={`${buttonClass} bg-brand-600 text-white hover:bg-brand-700`}
          aria-label="Confirm PIN"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
