import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from '../TagInput';

const mockUserTags = {
  react: 150,
  javascript: 75,
  typescript: 45,
  testing: 8,
  jest: 2,
  game_design: 60,
  'team:17': 25,
  'weird&chars': 5,
};

describe('TagInput Component', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  test('renders with initial tags', () => {
    render(
      <TagInput
        userTags={mockUserTags}
        value={['react', 'typescript']}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
  });

  test('shows placeholder when no tags are selected', () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    expect(screen.getByText('Add or create tags...')).toBeInTheDocument();
  });

  test('displays tag weights correctly', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    // Open the dropdown
    const input = screen.getByRole('combobox');
    await userEvent.click(input);

    // Find options by text content, then check the count within the specific span
    const checkTagCount = async (tagName, expectedCount) => {
      // Find the specific count span using its text content and selector
      const countElement = await screen.findByText(expectedCount.toString(), {
        selector: '.tag-count',
      });

      // Find the closest parent option element with the class 'item'
      const optionElement = countElement.closest('.item');

      // Assert that we found the parent option element
      expect(optionElement).toBeInTheDocument();

      // Assert that this option element also contains the correct tag name text
      // Use 'within' to scope the search to just this option element
      const { getByText } = within(optionElement);
      expect(getByText(tagName, { exact: false })).toBeInTheDocument();

      // Optional: Check weight class if needed
      // const weightSpan = optionElement.querySelector('.optioncount');
      // expect(weightSpan).toHaveClass(tagweight(expectedCount));
    };

    await checkTagCount('react', 150);
    await checkTagCount('javascript', 75);
    await checkTagCount('typescript', 45);
    await checkTagCount('testing', 8);
    await checkTagCount('jest', 2);
  });

  test('allows creating new tags', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'newtag{enter}');

    expect(mockOnChange).toHaveBeenCalledWith(['newtag']);
  });

  test('allows selecting an existing tag from dropdown', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    await userEvent.click(input); // Open dropdown

    // Find and click the 'javascript' option
    const javascriptOption = await screen.findByText('javascript');
    await userEvent.click(javascriptOption.closest('.item')); // Click the option container

    // Check if onChange was called with the correct tag
    expect(mockOnChange).toHaveBeenCalledWith(['javascript']);
  });

  test('filters options based on input', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'test');

    await waitFor(
      async () => {
        // Find options by role and check their text content
        const options = await screen.findAllByRole('option');
        // screen.debug(options); // Remove debug output for now

        // Check if any option's text content starts with 'testing'
        const hasTestingOption = options.some((option) =>
          option.textContent.trim().startsWith('testing')
        );
        expect(hasTestingOption).toBe(true);

        // Check that react is not present (find by role and check text)
        const allOptionsText = options.map((o) => o.textContent).join(' ');
        expect(allOptionsText).not.toContain('react');
      },
      { timeout: 2000 }
    ); // Increase timeout
  });

  test('filters options correctly ignoring special characters (normalization)', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );
    const input = screen.getByRole('combobox');

    // Test underscore
    await userEvent.clear(input);
    await userEvent.type(input, 'gamed');
    await waitFor(async () => {
      const options = await screen.findAllByRole('option');
      // Expect 'game_design' to be present (ignoring create option potentially)
      expect(options.some((o) => o.textContent.includes('game_design'))).toBe(
        true
      );
      // Expect 'react' (or others without 'gamed' normalized) not to be present
      expect(options.some((o) => o.textContent.includes('react'))).toBe(false);
    });

    // Test colon
    await userEvent.clear(input);
    await userEvent.type(input, 'team17');
    await waitFor(async () => {
      const options = await screen.findAllByRole('option');
      expect(options.some((o) => o.textContent.includes('team:17'))).toBe(true);
    });

    // Test other chars
    await userEvent.clear(input);
    await userEvent.type(input, 'weirdchars');
    await waitFor(async () => {
      const options = await screen.findAllByRole('option');
      expect(options.some((o) => o.textContent.includes('weird&chars'))).toBe(
        true
      );
    });

    // Test filtering doesn't match when it shouldn't
    await userEvent.clear(input);
    await userEvent.type(input, 'nothingshouldmatchthis');
    await waitFor(() => {
      // Expect only the 'Create...' option
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0].textContent).toContain(
        'Create "nothingshouldmatchthis"'
      );
    });
  });

  test('sorts options by count in dropdown', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    await userEvent.click(input);

    // Wait for dropdown to open completely
    const options = await screen.findAllByRole('option');

    // Filter out the "Create" option and any potential malformed options
    const tagOptions = options.filter((option) =>
      option.querySelector('.tag-count')
    );

    // Extract counts from the dedicated span
    const counts = tagOptions.map((option) => {
      const countElement = option.querySelector('.tag-count');
      return parseInt(countElement.textContent || '0', 10);
    });

    console.log('Extracted counts from tag spans:', counts);

    // Verify options are sorted by count in descending order
    // Note: We compare the extracted counts, assuming the DOM order reflects the sort
    expect(counts).toEqual([...counts].sort((a, b) => b - a));

    // Additional check: Verify the *order* of specific tags based on expected counts
    const tagNamesInOrder = tagOptions.map((option) => {
      // Find the tag name part of the text content
      const text = option.textContent;
      const countText = option.querySelector('.tag-count').textContent;
      return text.replace(countText, '').trim(); // Remove count to get tag name
    });

    console.log('Tag names in rendered order:', tagNamesInOrder);

    // Expected order based on mockUserTags counts
    const expectedOrder = Object.entries(mockUserTags)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([name]) => name);

    // Check if the rendered order matches the expected sorted order
    expect(tagNamesInOrder).toEqual(expectedOrder);
  });

  test('automatically focuses the input on render', () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
  });
});
