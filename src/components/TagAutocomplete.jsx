import React from 'react';
import Select from 'react-select';
import { useSelector, useDispatch } from 'react-redux';
import { setFormData } from '../redux/bookmarkSlice';

function TagAutocomplete() {
  const dispatch = useDispatch();
  const allTags = useSelector(state => state.tags.allTags);
  const selected = useSelector(state =>
    state.bookmark.formData.tags
      .split(' ')
      .filter(Boolean)
      .map(tag => ({ value: tag, label: tag }))
  );
  const options = allTags.map(tag => ({ value: tag, label: tag }));
  const handleChange = selectedOptions => {
    const tags = selectedOptions ? selectedOptions.map(o => o.value) : [];
    dispatch(setFormData({ tags: tags.join(' ') }));
  };
  return (
    <div className="tag-autocomplete">
      <Select
        isMulti
        options={options}
        value={selected}
        onChange={handleChange}
        placeholder="Add tags..."
      />
    </div>
  );
}

export default TagAutocomplete;