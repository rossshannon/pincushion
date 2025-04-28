import React, { useMemo } from 'react';
import AsyncCreatableSelect from 'react-select/async-creatable';
import PropTypes from 'prop-types';
import VirtualizedMenuList from './VirtualizedMenuList.jsx';
import './TagInput.css'; // Import the CSS file

const MAX_OPTIONS_TO_SHOW = 50;
const NORMALIZE_REGEX = /[&-_[\]#,+()$~%.'":*?<>{}]/g; // Regex to remove special chars

// Helper function to normalize strings for matching
const normalizeString = (str) => str.toLowerCase().replace(NORMALIZE_REGEX, '');

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

const TagInput = ({ userTags = {}, value = [], onChange, tabIndex }) => {
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
    return sortedOptions.slice(0, MAX_OPTIONS_TO_SHOW);
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
    const normalizedInputValue = normalizeString(inputValue); // Normalized version for matching

    if (!normalizedInputValue) {
      // Check normalized input for emptiness
      // If input is empty, show top N tags sorted by count (already memoized)
      callback(defaultOptionsList); // Use the pre-sorted default list
    } else {
      // Filter options based on normalized input value matching normalized label
      const filteredOptions = availableOptions.filter((option) =>
        normalizeString(option.label).includes(normalizedInputValue)
      );

      // Partition and sort: exact, prefix, substring (using normalized values)
      const exactMatch = [];
      const prefixMatches = [];
      const substringMatches = [];

      filteredOptions.forEach((option) => {
        const normalizedLabel = normalizeString(option.label);
        if (normalizedLabel === normalizedInputValue) {
          exactMatch.push(option);
        } else if (normalizedLabel.startsWith(normalizedInputValue)) {
          prefixMatches.push(option);
        } else {
          substringMatches.push(option);
        }
      });

      // Sort prefix and substring matches by count (descending) - using original count
      const sortFn = (a, b) => (b.count || 0) - (a.count || 0);
      prefixMatches.sort(sortFn);
      substringMatches.sort(sortFn);

      // Combine partitions
      const finalSortedOptions = [
        ...exactMatch,
        ...prefixMatches,
        ...substringMatches,
      ];

      // Slice and return
      callback(finalSortedOptions.slice(0, MAX_OPTIONS_TO_SHOW)); // Use constant
    }
  };

  // Custom format for dropdown options to include count and styling
  const formatOptionLabel = ({ label, count }, { context, inputValue }) => {
    // Only show the count and apply styling when rendering in the menu (dropdown)
    if (context === 'menu') {
      const numericCount = count !== undefined ? parseInt(count, 10) : 0;
      const weightClass = tagweight(numericCount);
      let labelElement = label; // Default to plain label

      // Add highlighting if inputValue is present and the original label contains it
      // Highlight based on original inputValue for visual accuracy
      if (
        inputValue &&
        label.toLowerCase().includes(inputValue.toLowerCase())
      ) {
        const startIndex = label
          .toLowerCase()
          .indexOf(inputValue.toLowerCase());
        const endIndex = startIndex + inputValue.length;
        labelElement = (
          <>
            {label.substring(0, startIndex)}
            <strong>{label.substring(startIndex, endIndex)}</strong>
            {label.substring(endIndex)}
          </>
        );
      }

      return (
        <div className="item">
          {' '}
          {/* Optional: Keep .item class if used by react-select styles */}
          {labelElement}
          <span className={`optioncount ${weightClass}`}>
            <span className="tag-count">{numericCount}</span>
          </span>
        </div>
      );
    }
    // When rendering as a selected value, just return the label text
    return label;
  };

  return (
    <AsyncCreatableSelect
      isMulti
      autoFocus
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
      tabIndex={tabIndex}
    />
  );
};

TagInput.propTypes = {
  userTags: PropTypes.objectOf(PropTypes.number),
  value: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  tabIndex: PropTypes.string,
};

export default TagInput;
