import React, { useMemo } from 'react';
import AsyncCreatableSelect from 'react-select/async-creatable';
import PropTypes from 'prop-types';
import VirtualizedMenuList from './VirtualizedMenuList.jsx';
import './TagInput.css'; // Import the CSS file

/**
 * TagInput component using react-select/async-creatable for tag selection and creation.
 *
 * @param {object} userTags - Object mapping tag names to usage counts. e.g., { 'react': 50, 'javascript': 100 }
 * @param {string[]} value - Array of current tag strings (controlled). e.g., ['react', 'typescript']
 * @param {function} onChange - Callback function when tags change. Receives an array of tag strings.
 */

// Helper function to determine CSS class based on tag count
const tagweight = (count) => {
  if (count > 100) return 'tw100';
  if (count > 50) return 'tw50';
  if (count > 10) return 'tw10';
  if (count > 1) return 'tw1';
  return ''; // Return empty string for count <= 1 or undefined
};

// Custom component to render only the label for selected tags (MultiValue)
// eslint-disable-next-line no-unused-vars
const MultiValueLabel = ({ children }) => {
  // Return only the children (the label text) directly, wrapped in a fragment
  // This avoids adding any extra DOM element that might interfere.
  // We don't need to worry about other props like selectProps here
  // because we are not rendering a DOM element that would receive them.
  return <>{children}</>;
};

const TagInput = ({ userTags = {}, value = [], onChange }) => {
  // Convert value array to the format react-select expects: { label: string, value: string }
  const currentSelectedOptions = useMemo(() => {
    return value.map((tag) => ({
      label: tag,
      value: tag,
    }));
  }, [value]); // Memoize based on the input 'value' prop

  // Memoize the full list of available options
  const availableOptions = useMemo(() => {
    return Object.entries(userTags).map(([label, count]) => ({
      label,
      value: label,
      count,
    }));
  }, [userTags]);

  // Memoize the initial list of options to show before user types
  const defaultOptionsList = useMemo(() => {
    const sortedOptions = [...availableOptions].sort(
      (a, b) => (b.count || 0) - (a.count || 0)
    );
    return sortedOptions.slice(0, 50);
  }, [availableOptions]);

  const handleChange = (selectedOptions) => {
    const newSelectedTags = selectedOptions || [];
    onChange(newSelectedTags.map((option) => option.value));
  };

  // Handle the creation of a new tag
  const handleCreate = (inputValue) => {
    const newTagValue = inputValue.trim();
    if (!newTagValue) return;
    // Check against the current value prop
    if (!value.includes(newTagValue)) {
      const newSelectedTagValues = [...value, newTagValue];
      onChange(newSelectedTagValues);
    } else {
      // Duplicate - react-select likely handles this, maybe log differently or remove
      // console.log(`Tag "${newTagValue}" already selected.`);
    }
  };

  // Define the function to load options asynchronously based on input
  const loadOptions = (inputValue, callback) => {
    if (!inputValue) {
      // If input is empty, show top N tags sorted by count
      const sortedOptions = [...availableOptions].sort(
        (a, b) => (b.count || 0) - (a.count || 0)
      );
      callback(sortedOptions.slice(0, 50));
    } else {
      // If input is not empty, filter and show top N matching tags
      const filteredOptions = availableOptions.filter((option) =>
        option.label.toLowerCase().includes(inputValue.toLowerCase())
      );
      // Optional: Sort filtered results by count as well
      const sortedFilteredOptions = filteredOptions.sort(
        (a, b) => (b.count || 0) - (a.count || 0)
      );
      callback(sortedFilteredOptions.slice(0, 50));
    }
  };

  // Custom format for dropdown options to include count and styling
  const formatOptionLabel = ({ label, count }, { context }) => {
    // Only show the count and apply styling when rendering in the menu (dropdown)
    if (context === 'menu') {
      const numericCount = count !== undefined ? parseInt(count, 10) : 0;
      const weightClass = tagweight(numericCount);
      return (
        <div className="item">
          {' '}
          {/* Optional: Keep .item class if used by react-select styles */}
          {label}
          <span className={`optioncount ${weightClass}`}>{numericCount}</span>
        </div>
      );
    }
    // When rendering as a selected value, just return the label text
    return label;
  };

  return (
    <AsyncCreatableSelect
      isMulti
      value={currentSelectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      formatOptionLabel={formatOptionLabel}
      placeholder="Add or create tags..."
      hideSelectedOptions={true}
      captureMenuScroll={false}
      components={{
        MenuList: VirtualizedMenuList,
      }}
      loadOptions={loadOptions}
      defaultOptions={defaultOptionsList}
      createOptionPosition="first"
      classNamePrefix="pincushion-tag-select"
    />
  );
};

TagInput.propTypes = {
  userTags: PropTypes.objectOf(PropTypes.number),
  value: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
};

export default TagInput;
