import bookmarkReducer, {
  type BookmarkState,
  fetchBookmarkDetails,
} from './bookmarkSlice';

const createState = (): BookmarkState =>
  bookmarkReducer(undefined, { type: 'bookmark/init' } as any);

describe('bookmarkSlice fetchBookmarkDetails concurrency guards', () => {
  it('ignores fulfilled payloads from stale request IDs', () => {
    const baseState = createState();
    const startingState: BookmarkState = {
      ...baseState,
      formData: {
        ...baseState.formData,
        url: 'https://new.example',
        title: 'Working Title',
      },
      initialLoading: true,
      lastFetchRequestId: 'latest-request',
      lastFetchTargetUrl: 'https://new.example',
    };

    const staleAction = fetchBookmarkDetails.fulfilled(
      {
        href: 'https://old.example',
        description: 'Old Title',
        extended: 'Old description',
        tags: 'old tag',
        shared: 'yes',
        toread: 'no',
      },
      'stale-request',
      'https://old.example'
    );

    const nextState = bookmarkReducer(startingState, staleAction);
    expect(nextState.formData.title).toBe('Working Title');
    expect(nextState.initialLoading).toBe(true);
  });

  it('completes loading without hydrating when the user changed URLs mid-flight', () => {
    const baseState = createState();
    const startingState: BookmarkState = {
      ...baseState,
      formData: {
        ...baseState.formData,
        url: '',
        title: 'Edited Locally',
      },
      initialLoading: true,
      hasExistingBookmark: false,
      lastFetchRequestId: 'in-flight-request',
      lastFetchTargetUrl: 'https://old.example',
    };

    const action = fetchBookmarkDetails.fulfilled(
      {
        href: 'https://old.example',
        description: 'Server Title',
        tags: 'tag-one tag-two',
        shared: 'no',
        toread: 'yes',
      },
      'in-flight-request',
      'https://old.example'
    );

    const nextState = bookmarkReducer(startingState, action);
    expect(nextState.initialLoading).toBe(false);
    expect(nextState.formData.title).toBe('Edited Locally');
    expect(nextState.hasExistingBookmark).toBe(false);
  });

  it('ignores rejected payloads that belong to older URLs', () => {
    const baseState = createState();
    const startingState: BookmarkState = {
      ...baseState,
      formData: {
        ...baseState.formData,
        url: 'https://current.example',
      },
      initialLoading: true,
      lastFetchRequestId: 'in-flight-request',
      lastFetchTargetUrl: 'https://current.example',
    };

    const staleError = fetchBookmarkDetails.rejected(
      new Error('timeout'),
      'stale-request',
      'https://old.example',
      'Old failure'
    );

    const nextState = bookmarkReducer(startingState, staleError);
    expect(nextState.errors.generic).toBe(startingState.errors.generic);
    expect(nextState.initialLoading).toBe(true);
  });
});
