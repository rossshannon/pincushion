import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import advancedFormat from 'dayjs/plugin/advancedFormat'; // For 'Do' ordinal suffix
import localizedFormat from 'dayjs/plugin/localizedFormat'; // For locale-aware formats like 'LT' or potentially 'h:mma'

// Extend dayjs with plugins once
dayjs.extend(relativeTime);
dayjs.extend(advancedFormat);
dayjs.extend(localizedFormat);

/**
 * Formats an ISO date string into relative and absolute formats.
 * @param {string} isoString - The ISO date string to format.
 * @returns {{relative: string, absolute: string}} - Object containing relative and absolute time strings.
 */
export const getTimestampFormats = (isoString) => {
  if (!isoString) return { relative: '', absolute: '' };
  try {
    const date = dayjs(isoString);
    // Format similar to 'dddd, MMMM Do YYYY, h:mma' using dayjs
    const absoluteFormat = date.format('dddd, MMMM Do YYYY, h:mma');
    const relativeFormat = date.fromNow();
    return { relative: relativeFormat, absolute: absoluteFormat };
  } catch (e) {
    console.error('Error formatting timestamp with dayjs:', e);
    return { relative: 'Invalid Date', absolute: 'Invalid Date' };
  }
};
