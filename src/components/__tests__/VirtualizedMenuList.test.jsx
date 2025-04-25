import React from 'react';
import { render, screen } from '@testing-library/react';
import VirtualizedMenuList from '../VirtualizedMenuList';

// Mock react-window's FixedSizeList
jest.mock('react-window', () => ({
  FixedSizeList: ({ children: Row, itemCount, itemData, height }) => {
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push(
        <Row
          key={i}
          index={i}
          data={itemData}
          style={{ height: '40px', width: '100%' }}
        />
      );
    }
    return (
      <div data-testid="virtual-list" style={{ height: `${height}px` }}>
        {items}
      </div>
    );
  },
}));

describe('VirtualizedMenuList Component', () => {
  const mockOptions = [
    { label: 'Option 1', value: '1' },
    { label: 'Option 2', value: '2' },
    { label: 'Option 3', value: '3' },
  ];

  const mockChildren = mockOptions.map((option) => (
    <div key={option.value} role="option">
      {option.label}
    </div>
  ));

  test('renders list with correct number of options', () => {
    render(
      <VirtualizedMenuList
        options={mockOptions}
        maxHeight={300}
        getValue={() => []}
      >
        {mockChildren}
      </VirtualizedMenuList>
    );

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(mockOptions.length);
    expect(options[0]).toHaveTextContent('Option 1');
    expect(options[1]).toHaveTextContent('Option 2');
    expect(options[2]).toHaveTextContent('Option 3');
  });

  test('renders empty state correctly', () => {
    render(
      <VirtualizedMenuList options={[]} maxHeight={300} getValue={() => []}>
        <div>No options available</div>
      </VirtualizedMenuList>
    );

    expect(screen.getByText('No options available')).toBeInTheDocument();
    expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
  });

  test('respects maxHeight prop', () => {
    render(
      <VirtualizedMenuList
        options={mockOptions}
        maxHeight={200}
        getValue={() => []}
      >
        {mockChildren}
      </VirtualizedMenuList>
    );

    const virtualList = screen.getByTestId('virtual-list');
    expect(virtualList).toBeInTheDocument();
    // Height should be min of maxHeight and total items height (40px * 3 = 120px)
    expect(virtualList).toHaveStyle({ height: '120px' });
  });

  test('handles style prop in Row component', () => {
    render(
      <VirtualizedMenuList
        options={mockOptions}
        maxHeight={300}
        getValue={() => []}
      >
        {mockChildren}
      </VirtualizedMenuList>
    );

    const options = screen.getAllByRole('option');
    options.forEach((option) => {
      const parent = option.parentElement;
      expect(parent).toHaveStyle({
        height: '40px',
        width: '100%',
        overflow: 'hidden',
      });
    });
  });

  test('renders all children with correct data', () => {
    const mockChildrenWithData = mockOptions.map((option) => (
      <div key={option.value} role="option" data-value={option.value}>
        {option.label}
      </div>
    ));

    render(
      <VirtualizedMenuList
        options={mockOptions}
        maxHeight={300}
        getValue={() => []}
      >
        {mockChildrenWithData}
      </VirtualizedMenuList>
    );

    mockOptions.forEach((option) => {
      const element = screen.getByText(option.label);
      expect(element).toBeInTheDocument();
      expect(element).toHaveAttribute('data-value', option.value);
    });
  });
});
