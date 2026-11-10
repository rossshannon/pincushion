import { splitTags } from '../tagList';

describe('splitTags', () => {
  test('splits on any run of whitespace and drops the empties', () => {
    expect(splitTags('  one two\tthree\n four  ')).toEqual(['one', 'two', 'three', 'four']);
    expect(splitTags('')).toEqual([]);
    expect(splitTags('   ')).toEqual([]);
  });

  test('leaves punctuation alone, commas included', () => {
    expect(splitTags('c++ via:someone a,b')).toEqual(['c++', 'via:someone', 'a,b']);
  });
});
