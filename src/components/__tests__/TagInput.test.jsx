import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from '../TagInput';

const mockUserTags = {
  react: 150,
  javascript: 75,
  typescript: 45,
  testing: 8,
  jest: 2,
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

    // Check tag weight classes
    const reactOption = await screen.findByText('react');
    const javascriptOption = await screen.findByText('javascript');
    const typescriptOption = await screen.findByText('typescript');
    const testingOption = await screen.findByText('testing');
    const jestOption = await screen.findByText('jest');

    expect(reactOption.closest('.item')).toHaveTextContent('150');
    expect(javascriptOption.closest('.item')).toHaveTextContent('75');
    expect(typescriptOption.closest('.item')).toHaveTextContent('45');
    expect(testingOption.closest('.item')).toHaveTextContent('8');
    expect(jestOption.closest('.item')).toHaveTextContent('2');
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

    await waitFor(async () => {
      // Find options by role and check their text content
      const options = await screen.findAllByRole('option');
      screen.debug(options); // Debug the found options

      // Check if any option's text content starts with 'testing'
      const hasTestingOption = options.some((option) =>
        option.textContent.trim().startsWith('testing')
      );
      expect(hasTestingOption).toBe(true);

      // Check that react is not present (find by role and check text)
      const allOptionsText = options.map((o) => o.textContent).join(' ');
      expect(allOptionsText).not.toContain('react');
    });
  });

  test('sorts options by count in dropdown', async () => {
    render(
      <TagInput userTags={mockUserTags} value={[]} onChange={mockOnChange} />
    );

    const input = screen.getByRole('combobox');
    await userEvent.click(input);

    const options = await screen.findAllByRole('option');
    const counts = options.map((option) =>
      parseInt(option.textContent.match(/\d+$/)?.[0] || '0')
    );

    // Verify options are sorted by count in descending order
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});
