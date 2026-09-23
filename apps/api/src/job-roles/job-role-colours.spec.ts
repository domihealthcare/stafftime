import { JOB_ROLE_COLOURS, nextFreeColour } from './job-role-colours';

describe('nextFreeColour', () => {
  it('starts at the first colour', () => {
    expect(nextFreeColour([])).toBe('blue');
  });

  it('takes the first colour nobody is wearing, in palette order', () => {
    expect(nextFreeColour(['blue', 'orange', 'yellow'])).toBe('aqua');
  });

  it('ignores anything that is not one of the colours', () => {
    expect(nextFreeColour(['#ff0000', 'blue'])).toBe('orange');
  });

  it('doubles up on the least-used colour once all are taken', () => {
    const everyOnce = [...JOB_ROLE_COLOURS];
    expect(nextFreeColour(everyOnce)).toBe('blue');
    expect(nextFreeColour([...everyOnce, 'blue', 'orange'])).toBe('aqua');
  });
});
