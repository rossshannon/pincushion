import React, { type CSSProperties, type ReactNode } from 'react';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import type { GroupBase, MenuListProps } from 'react-select';

type OptionType = { label: string; value: string; count?: number };
type DataType = { children: ReactNode };

const Row = ({ data, index, style }: ListChildComponentProps<DataType>) => {
  const optionArray = React.Children.toArray(data.children);
  const OptionComponent = optionArray[index];
  const combinedStyle: CSSProperties = { ...style, overflow: 'hidden' };
  return <div style={combinedStyle}>{OptionComponent}</div>;
};

const VirtualizedMenuList = (
  props: MenuListProps<OptionType, true, GroupBase<OptionType>>
): JSX.Element => {
  const { options, children, maxHeight } = props;
  const itemHeight = 40;
  const listHeight = Math.min(maxHeight, options.length * itemHeight);

  if (!options.length) {
    return <div style={{ padding: '8px 12px' }}>{children}</div>;
  }

  return (
    <List
      height={listHeight}
      itemCount={options.length}
      itemSize={itemHeight}
      itemData={{ children }}
      width="100%"
    >
      {Row}
    </List>
  );
};

export default VirtualizedMenuList;
