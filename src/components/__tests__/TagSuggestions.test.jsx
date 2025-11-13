import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagSuggestions from '../TagSuggestions';

describe('TagSuggestions (presentational)', () => {
  const baseProps = {
    suggestions: ['tag1', '$separator', 'tag2'],
    isLoading: false,
    isEmpty: false,
    onSuggestionClick: jest.fn(),
  };

  beforeEach(() => {
    baseProps.onSuggestionClick.mockClear();
  });

  test('renders suggestions and separator label', () => {
    render(<TagSuggestions {...baseProps} />);
    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
    const separator = screen.getByLabelText(/ai tag suggestions/i);
    expect(separator).toHaveTextContent('•');
    const spinnerText = screen.getByText(/finding suggested tags/i);
    expect(spinnerText).toHaveClass('tag-suggestions__text', { exact: false });
    expect(spinnerText).toHaveClass('hidden');
  });

  test('shows loading indicator', () => {
    render(<TagSuggestions {...baseProps} isLoading />);
    const spinnerText = screen.getByText(/finding suggested tags/i);
    expect(spinnerText).not.toHaveClass('hidden');
    expect(screen.queryByText('tag1')).not.toBeInTheDocument();
  });

  test('renders nothing when empty', () => {
    const { container } = render(
      <TagSuggestions {...baseProps} isEmpty suggestions={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('fires onSuggestionClick when tag clicked and does not submit form', async () => {
    render(<TagSuggestions {...baseProps} />);
    const button = screen.getByText('tag1');
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(baseProps.onSuggestionClick).toHaveBeenCalledWith('tag1');
  });

  test('ignores separator clicks', async () => {
    render(<TagSuggestions {...baseProps} />);
    await userEvent.click(screen.getByLabelText(/ai tag suggestions/i));
    expect(baseProps.onSuggestionClick).not.toHaveBeenCalled();
  });
});
