import React from 'react';
import { FixedSizeList as List } from 'react-window';
import PropTypes from 'prop-types';

// The Row component: Renders a single option provided by react-select
// `data` contains { children: React components from react-select for each option }
// `index` is the item index
// `style` is provided by react-window for positioning
const Row = ({ data, index, style }) => {
  // data.children contains the array of Option components provided by react-select
  const { children } = data;
  const OptionComponent = React.Children.toArray(children)[index];

  // Combine the positioning style from react-window with overflow: hidden
  const combinedStyle = { ...style, overflow: 'hidden' };

  // Render the actual Option component from react-select,
  // applying the style provided by react-window for positioning.
  // The OptionComponent already has the necessary props (onClick, isSelected, etc.)
  // Apply the combined style to the container div.
  return <div style={combinedStyle}>{OptionComponent}</div>;
};

Row.propTypes = {
  data: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  style: PropTypes.object.isRequired,
};

// The VirtualizedMenuList component
const VirtualizedMenuList = ({
  options,
  children,
  maxHeight,
  // eslint-disable-next-line no-unused-vars -- Required by react-select
  getValue,
}) => {
  // eslint-disable-line no-unused-vars -- getValue is required by react-select but unused here
  // Removed direct style definitions, rely on the OptionComponent's styles

  // Determine approximate height. Let's try 40px again.
  const itemHeight = 40; // A common estimate for react-select row height

  // We no longer need focusedOptionIndex for initialScrollOffset here,
  // react-select's own focus management should handle scrolling the focused item into view
  // when using the actual Option components.

  // Ensure maxHeight is respected
  const listHeight = Math.min(maxHeight, options.length * itemHeight);

  // Pass only the children (Option components) to the Row renderer via itemData
  // The Row component will pick the correct child based on the index.
  const itemData = { children };

  if (!options.length) {
    // Handle case where there are no options (e.g., search yields no results)
    // react-select might pass a "No options" message component as children
    return <div style={{ padding: '8px 12px' }}>{children}</div>;
  }

  return (
    <List
      height={listHeight}
      itemCount={options.length}
      itemSize={itemHeight}
      // initialScrollOffset can sometimes interfere with react-select's focus scrolling
      // Let's remove it for now and rely on react-select's default behavior.
      // initialScrollOffset={focusedOptionIndex > -1 ? focusedOptionIndex * itemHeight : 0}
      itemData={itemData} // Pass children to Row component
    >
      {Row}
    </List>
  );
};

VirtualizedMenuList.propTypes = {
  options: PropTypes.array.isRequired,
  children: PropTypes.node.isRequired,
  maxHeight: PropTypes.number.isRequired,
  getValue: PropTypes.func.isRequired, // Needed by react-select
};

export default VirtualizedMenuList;
