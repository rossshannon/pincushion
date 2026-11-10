import { splitTags } from '../tagList';

describe('splitTags', () => {
  test('splits on any run of whitespace and drops the empties', () => {
    expect(splitTags('  one two\tthree\n four  ')).toEqual(['one', 'two', 'three', 'four']);
    expect(splitTags('')).toEqual([]);
    expect(splitTags('   ')).toEqual([]);
  });

  test('splits only on ASCII whitespace', () => {
    expect(splitTags('foo\u00a0bar 日本\u3000語 \ufeffbom')).toEqual([
      'foo\u00a0bar',
      '日本\u3000語',
      '\ufeffbom',
    ]);
  });

  test('leaves punctuation alone, commas included', () => {
    expect(splitTags('c++ via:someone a,b')).toEqual(['c++', 'via:someone', 'a,b']);
  });
});
