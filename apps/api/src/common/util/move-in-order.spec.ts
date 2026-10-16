import { moveInOrder } from './move-in-order';

describe('moveInOrder', () => {
  it('swaps an item with its neighbour', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('cannot move past either end, or something not there', () => {
    expect(moveInOrder(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveInOrder(['a', 'b'], 'b', 1)).toBeNull();
    expect(moveInOrder(['a', 'b'], 'z', 1)).toBeNull();
  });
});
