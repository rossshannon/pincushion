import React from 'react';
import CreatableSelect from 'react-select/creatable';
import PropTypes from 'prop-types';

/**
 * TagInput component using react-select/creatable for tag selection and creation.
 *
 * @param {object} userTags - Object mapping tag names to usage counts. e.g., { 'react': 50, 'javascript': 100 }
 * @param {string[]} initialTags - Array of initial tag strings. e.g., ['react', 'typescript']
 * @param {function} onChange - Callback function when tags change. Receives an array of tag strings.
 */
const TagInput = ({ userTags = {}, initialTags = [], onChange }) => {
  // Convert initialTags array to the format react-select expects: { label: string, value: string }
  const currentSelectedOptions = initialTags.map((tag) => ({
    label: tag,
    value: tag,
  }));

  // Convert userTags object to the format react-select expects for dropdown options
  // No initial sorting needed as per user request
  const availableOptions = Object.entries(userTags).map(([label, count]) => ({
    label,
    value: label,
    count, // Keep count for potential future use (e.g., display)
  }));

  const handleChange = (selectedOptions) => {
    const newSelectedTags = selectedOptions || []; // Handle clear action
    // Notify parent component with an array of tag strings
    onChange(newSelectedTags.map((option) => option.value));
  };

  // Handle the creation of a new tag
  // Let CreatableSelect handle adding the new option to the selectedOptions array passed to handleChange.
  const handleCreate = (inputValue) => {
    const newTagValue = inputValue.trim();
    if (!newTagValue) return; // Don't create empty tags

    // IMPORTANT: As per react-select docs, onCreateOption should typically
    // call the main onChange handler with the updated value array.

    // Construct the new option object
    const newOption = { label: newTagValue, value: newTagValue };

    // Get the values of the currently selected options
    const currentValues = currentSelectedOptions.map((opt) => opt.value);

    // Combine the current values with the new tag value (ensuring no duplicates)
    if (!currentValues.includes(newTagValue)) {
      const newSelectedTagValues = [...currentValues, newTagValue];
      // Call the parent's onChange handler with the full updated list of tag strings
      onChange(newSelectedTagValues);
    } else {
      // Optional: handle case where tag already exists (maybe focus it?)
      console.log(`Tag "${newTagValue}" already selected.`);
    }
  };

  // Basic option label format - just shows the tag name
  const formatOptionLabel = ({ label }) => <span>{label}</span>;

  return (
    <CreatableSelect
      isMulti
      options={availableOptions}
      value={currentSelectedOptions} // Use the recalculated value based on current props
      onChange={handleChange}
      onCreateOption={handleCreate} // Still needed to trigger the creation process in react-select
      formatOptionLabel={formatOptionLabel}
      placeholder="Add or create tags..."
      // Ensure selectize behaviours are mapped:
      hideSelectedOptions={true} // Default is usually true, but explicit is good
      // We might need onKeyDown handler later for fine-tuning Enter/Tab/etc.
    />
  );
};

TagInput.propTypes = {
  userTags: PropTypes.objectOf(PropTypes.number),
  initialTags: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
};

export default TagInput;
