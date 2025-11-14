import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(relativeTime);
dayjs.extend(advancedFormat);
dayjs.extend(localizedFormat);

export type TimestampFormats = {
  relative: string;
  absolute: string;
};

export const getTimestampFormats = (
  isoString: string | null | undefined
): TimestampFormats => {
  if (!isoString) return { relative: '', absolute: '' };
  try {
    const date = dayjs(isoString);
    const absoluteFormat = date.format('dddd, MMMM Do YYYY, h:mma');
    const relativeFormat = date.fromNow();
    return { relative: relativeFormat, absolute: absoluteFormat };
  } catch (e) {
    console.error('Error formatting timestamp with dayjs:', e);
    return { relative: 'Invalid Date', absolute: 'Invalid Date' };
  }
};
