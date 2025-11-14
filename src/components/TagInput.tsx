import React, { useMemo } from 'react';
import AsyncCreatableSelect from 'react-select/async-creatable';
import {
  components as selectComponents,
  type FormatOptionLabelMeta,
  type MultiValueRemoveProps,
  type StylesConfig,
} from 'react-select';
import VirtualizedMenuList from './VirtualizedMenuList';
import './TagInput.css';

type TagOption = {
  label: string;
  value: string;
  count?: number;
};

const MAX_OPTIONS_TO_SHOW = 50;
// eslint-disable-next-line no-useless-escape
const NORMALIZE_REGEX = /[&_\[\]#,+()$~%.'"*:<>?{}-]/g;

const normalizeString = (str: string): string =>
  str.toLowerCase().replace(NORMALIZE_REGEX, '');

const tagweight = (count?: number): string => {
  if (!count) return '';
  if (count > 100) return 'tw100';
  if (count > 50) return 'tw50';
  if (count > 10) return 'tw10';
  if (count > 1) return 'tw1';
  return '';
};

interface TagInputProps {
  userTags?: Record<string, number>;
  value?: string[];
  onChange: (tags: string[]) => void;
  tabIndex?: number;
  inputId?: string;
  autoFocus?: boolean;
  id?: string;
}

const MultiValueRemove = (
  props: MultiValueRemoveProps<TagOption>
): JSX.Element => {
  const innerProps = props.innerProps || {};
  return (
    <selectComponents.MultiValueRemove
      {...props}
      innerProps={{
        ...innerProps,
        style: {
          ...(innerProps.style || {}),
          cursor: 'pointer',
        },
      }}
    />
  );
};

const TagInput: React.FC<TagInputProps> = ({
  userTags = {},
  value = [],
  onChange,
  tabIndex,
  inputId,
  autoFocus = false,
  id,
}) => {
  const currentSelectedOptions = useMemo<TagOption[]>(() => {
    return value.map((tag) => ({
      label: tag,
      value: tag,
    }));
  }, [value]);

  const availableOptions = useMemo<TagOption[]>(() => {
    return Object.entries(userTags).map(([label, count]) => ({
      label,
      value: label,
      count,
    }));
  }, [userTags]);

  const defaultOptionsList = useMemo<TagOption[]>(() => {
    const sortedOptions = [...availableOptions].sort(
      (a, b) => (b.count || 0) - (a.count || 0)
    );
    return sortedOptions.slice(0, MAX_OPTIONS_TO_SHOW);
  }, [availableOptions]);

  const handleChange = (selectedOptions: readonly TagOption[] | null) => {
    const newSelectedTags = selectedOptions || [];
    onChange(newSelectedTags.map((option) => option.value));
  };

  const selectStyles = useMemo<StylesConfig<TagOption, true>>(
    () => ({
      multiValueRemove: (base) => ({
        ...base,
        backgroundColor: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        paddingLeft: 0,
        paddingRight: 0,
        borderRadius: 0,
        ':hover': {
          backgroundColor: 'var(--pincushion-tag-chip-remove-hover)',
          color: 'inherit',
        },
      }),
    }),
    []
  );

  const handleCreate = (inputValue: string) => {
    const newTagValue = inputValue.trim();
    if (!newTagValue) return;
    if (!value.includes(newTagValue)) {
      onChange([...value, newTagValue]);
    }
  };

  const loadOptions = (
    inputValue: string,
    callback: (options: TagOption[]) => void
  ): void => {
    const normalizedInputValue = normalizeString(inputValue);

    if (!normalizedInputValue) {
      callback(defaultOptionsList);
      return;
    }

    const filteredOptions = availableOptions.filter((option) =>
      normalizeString(option.label).includes(normalizedInputValue)
    );

    const exactMatch: TagOption[] = [];
    const prefixMatches: TagOption[] = [];
    const substringMatches: TagOption[] = [];

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

    const sortFn = (a: TagOption, b: TagOption) => (b.count || 0) - (a.count || 0);
    prefixMatches.sort(sortFn);
    substringMatches.sort(sortFn);

    const finalSortedOptions = [
      ...exactMatch,
      ...prefixMatches,
      ...substringMatches,
    ];

    callback(finalSortedOptions.slice(0, MAX_OPTIONS_TO_SHOW));
  };

  const formatOptionLabel = (
    { label, count }: TagOption,
    { context, inputValue }: FormatOptionLabelMeta<TagOption>
  ): React.ReactNode => {
    if (context === 'menu') {
      const numericCount = count ?? 0;
      const weightClass = tagweight(numericCount);
      let labelElement: React.ReactNode = label;

      if (
        inputValue &&
        label.toLowerCase().includes(inputValue.toLowerCase())
      ) {
        const lowerLabel = label.toLowerCase();
        const lowerInput = inputValue.toLowerCase();
        const startIndex = lowerLabel.indexOf(lowerInput);
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
          {labelElement}
          <span className={`optioncount ${weightClass}`}>
            <span className="tag-count">{numericCount}</span>
          </span>
        </div>
      );
    }
    return label;
  };

  return (
    <AsyncCreatableSelect<TagOption, true>
      id={id}
      isMulti
      autoFocus={autoFocus}
      value={currentSelectedOptions}
      onChange={handleChange}
      onCreateOption={handleCreate}
      formatOptionLabel={formatOptionLabel}
      placeholder="Add or create tags..."
      hideSelectedOptions
      captureMenuScroll={false}
      inputId={inputId}
      components={{
        MenuList: VirtualizedMenuList,
        MultiValueRemove,
      }}
      styles={selectStyles}
      loadOptions={loadOptions}
      defaultOptions={defaultOptionsList}
      createOptionPosition="last"
      classNamePrefix="pincushion-tag-select"
      tabIndex={tabIndex}
    />
  );
};

export default TagInput;
