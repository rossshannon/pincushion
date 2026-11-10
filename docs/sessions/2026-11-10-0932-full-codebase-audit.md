# Session: Full codebase audit (2.4.1)

**Date**: 2026-11-10
**Status**: Complete; draft PR open, waiting on Ross's review
**Branch**: `claude/project-thread-qh6xca`

## Overview

Ross asked for the whole of Pincushion to be read for anything broken, inconsistent, inefficient, dangerous, insecure, incomplete or no longer needed, with the certain items fixed and the rest listed for him. Every source file, test, config, workflow and the README were read. The baseline was healthy (325 tests, lint, typecheck and build all passing), so the findings came from reading and from driving the app in a real browser against a mocked bridge.

The one finding that needed a browser to see was the tag autocomplete: it was virtualised with react-window, and arrowing past the visible rows moved the highlight onto options that were never mounted.

## Goals

- [x] Read the whole project
- [x] Fix what is certain, with tests
- [x] Keep the suite green and check for regressions (344 tests; production build driven end to end in Chromium)
- [x] Code review per the project policy, and fix its findings
- [x] List the uncertain items for Ross (below)

## Key Decisions

### Drop react-window instead of repairing the virtualised menu

`TagInput` caps the menu at 50 options (`MAX_OPTIONS_TO_SHOW`), so virtualising it bought nothing and cost two bugs: react-select scrolls the focused option into view through the `innerRef` it hands its MenuList, which `VirtualizedMenuList` ignored; and the list was sized from `props.options`, which still includes selected options that `hideSelectedOptions` leaves out of `children`. react-select's own MenuList has neither problem. Zebra striping moved to `:nth-child(even)` on the option. If the cap is ever raised into the thousands, virtualise again, but forward `innerRef` and size from `children`.

### Tags are split on whitespace only, at the reducer

Pinboard separates tags with spaces, so a tag holding whitespace is saved as several tags while the local counts record one that does not exist. `splitTags` (`utils/tagList.ts`) is applied in `toTagArray`, the single point every tag list passes through on its way into the form, and in `TagInput.handleCreate`. Commas are left alone on purpose: Pinboard's API docs say tags may not contain them, but existing bookmarks made on the website might, and splitting a loaded tag would rewrite the user's data on the next save.

### GPT requests are tracked by request id, not aborted

`gptRequestId` mirrors `suggestedRequestId`. A superseded request still runs to completion at OpenAI (two small calls); only its answer is dropped. Aborting would need the thunk's signal threaded through `gptSuggestions.ts` and the promise held in `App`; left as a possible follow-up.

### The lookup key includes the token

`App` keyed lookups on `user + url`. With the new "Pinboard rejected your username or API token" message sending people to Settings, correcting only the token would not have retried the lookup. The key is now `user + token + url`. A lookup rejected with 401 also skips the suggest call, as a 414 already did.

### Credential check uses posts/update

Settings verified credentials with `tags/get` (the whole tag list, hundreds of KB) against a hardcoded bridge URL with an 8s timeout. It now calls `posts/update` (one timestamp) through `bridgeUrl`, with a 20s budget in `REQUEST_TIMEOUTS_MS.verify`, since on first use it is the request that wakes the dyno.

### Dependency updates were done package by package

`npm audit fix` and `npm update` both crash in npm 10.9.9's resolver (`Cannot read properties of null (reading 'edgesOut')`) whenever vite or vitest is in the set. The transitive packages were updated with npm 10; vite, vitest and typescript-eslint with `npx npm@11`. `npm ci` with npm 10 (what CI uses) installs the resulting lockfile cleanly.

## Changes Made

### Fixes

| Area | File(s) | Change |
| --- | --- | --- |
| Tag menu keyboard scrolling, blank rows | `components/TagInput.tsx`, `TagInput.css` | Use react-select's MenuList; delete `VirtualizedMenuList` and the react-window type shim |
| Tags with spaces | `utils/tagList.ts`, `redux/bookmarkSlice.ts`, `TagInput.tsx` | Split on whitespace at the reducer and on create |
| Stale GPT answers | `redux/tagSlice.ts` | `gptRequestId`; reset also clears `filteredRecentTags` |
| Blocked localStorage crashed start-up | `utils/safeStorage.ts`, `credentialStorage.ts`, `recentTagStorage.ts`, `tagCache.ts` | One guarded accessor shared by all three |
| No or rejected credentials | `redux/bookmarkSlice.ts`, `App.tsx` | Plain messages; no request without credentials; token change retries the lookup; 401 skips suggest |
| Padded URL | `redux/bookmarkSlice.ts` | Trim before validating, sending and comparing |
| Credential verification | `services/credentialValidation.ts`, `pinboardApi.ts` | Configured bridge, `posts/update`, 20s, plain timeout message |
| `npm run preview` 404s | `vite.config.ts` | Serve the preview from `/pincushion/` too |

### Removed

- `src/utils/tagUtils.ts` and its test: a snake_case duplicate of `tagSuggestionFilters.ts`, imported by nothing else
- `src/components/VirtualizedMenuList.tsx`, its test, `src/types/react-window.d.ts`
- `public/images/padlock.png`, `public/images/spinner_2x.gif`: the stylesheet uses the copies in `src/assets`
- `setFilteredRecentTags` reducer, `.twitter-card-panel__message--error` rule, `declare module '*.scss'`, a duplicated filter entry
- Dependencies: `react-window`, `redux` (Redux Toolkit brings it), `browserslist` and its config block (the build is byte-identical without it), `trim-newlines`

### Tooling

- `@types/node` declared (tsconfig named it but it only arrived transitively, and vanished when the unused packages went)
- axios 1.15.0 → 1.21.1, vite 8.0.8 → 8.3.7, vitest 4.1.4 → 4.1.12, plus transitive updates: 24 advisories (11 high) → 6 moderate, all dev-only (minimatch under typescript-eslint)
- CI builds the app; CodeQL scans `master` with `codeql-action@v4` (was v1, triggered by the built `gh-pages` branch); deploy job reduced to `contents: write`
- README: 2.4.1 entry, the missing 2.3.2 entry, LICENSE link, typos
- `.cursor/rules/project-overview.mdc` rewritten: it described `src/index.js` and `src/@redux/`

## Review

The multi-LLM review skill lives on Ross's Mac and was not reachable from this session, so the fallback in the project policy was used: `/code-review` at high effort, twice. See the PR description for what each pass found and what was done about it.

## For Ross to decide

Not changed, because each is a judgement call or changes behaviour.

**Security and privacy**

1. Credentials live in `localStorage` on `rossshannon.github.io`, an origin shared with every other Pages site under that account. Script on any of them can read the Pinboard token and OpenAI key. A custom domain for Pincushion would isolate it. Settings and the README call this storage "secure".
2. The bookmarklet puts the page URL, title and selected text in the query string, so GitHub's servers see every bookmarked address, private ones included. Passing them after `#` would keep them in the browser. Needs the app to read both and a bookmarklet reinstall.
3. There is no Content-Security-Policy. A `<meta>` CSP is workable (the inline warm-up script needs a hash; react-select needs inline styles).
4. An unchecked "private" sends no `shared` parameter, so Pinboard applies the account default. With "save all bookmarks as private" on, unchecking does not make a bookmark public. Sending `shared=yes` explicitly fixes that but would publish bookmarks for anyone relying on the default.
5. `gpt-4o-mini` is hardcoded in `gptSuggestions.ts` and `credentialValidation.ts`.

**Behaviour**

6. Escape closes the popup even when it would only have closed the autocomplete menu, and in Settings. react-select prevents default on every Escape, so `defaultPrevented` cannot tell the cases apart.
7. Text typed in the tag field but not committed (Enter, Tab) is discarded when focus leaves, including on clicking Save.
8. Commas in typed tags are kept (see Key Decisions).
9. Editing the title or description re-asks GPT after each pause; there is no debounce, and superseded requests are not aborted.
10. Recent tags are not per account, and re-saving an old bookmark puts all its tags in "recent".
11. Settings shows "Check your Pinboard username." beside any verification failure, network errors included.
12. `handleSettingsSave` ignores `persistStoredCredentials` returning false, so with storage blocked the credentials work until the popup closes and then vanish without a word.
13. The deploy workflow runs on every push to `master` without waiting for CI.
14. Failures of the tag refresh, Pinboard suggestions and GPT are stored (`tags.error`, `gptError`) but never shown.

**Clean-up candidates**

15. `Gemfile`, `Gemfile.lock` and `.licensed.yml` (the `licensed` gem): nothing runs it, and Dependabot keeps opening bundler PRs for it (#76, #77).
16. Tests follow three layouts (`src/__testing__`, `__tests__` folders, beside the source); three files use the deprecated `redux-mock-store`; `App.test.jsx` is untyped.
17. axios could be replaced by `fetch`; the bundle is 397 kB (134 kB gzipped).
18. `TwitterCardPreview` returns null before its outer `CSSTransition` can animate out, so the panel's exit transition never plays; `previewError` and `previewStatus` are stored but unused.
19. ESLint 8 is end-of-life; the remaining advisories need typescript-eslint and ESLint majors.
20. Actions are on old majors (`checkout@v4` and `setup-node@v4` where v7 exists, `peaceiris/actions-gh-pages@v3`).
21. `keep_files: true` means `gh-pages` keeps every old hashed asset for ever.
22. Positive `tabIndex` values and `role="form"` on the bookmark form.
23. `.envrc` adds `bin` and `bin/local`, which do not exist.
24. Dependabot PRs #66 to #75 and #78 are overtaken by this PR's updates.

## Lessons Learned

1. **jsdom hides layout bugs.** `VirtualizedMenuList` had a passing test that mocked react-window. The keyboard bug only showed in Chromium: `scrollTop` stayed 0 and no option carried `--is-focused` after twelve ArrowDowns.
2. **`vite preview` is `command: 'serve'`.** A `base` chosen by `command === 'build'` leaves the preview serving a build whose asset URLs point elsewhere. Use `isPreview`.
3. **Phantom dependencies surface when you prune.** `@types/node` was only present because something unused pulled it in.
4. **npm 10's resolver crash is not the lockfile's fault.** `npm ci` is fine; only commands that rebuild the ideal tree around vitest's optional peers fail. `npx npm@11` works.

## References

- Screenshots of the tag menu before and after: project files, `pincushion-audit/`
- Browser check: Playwright against `npm start` and `npm run preview`, with `pinboard-api.herokuapp.com` routed to canned responses
- Earlier related work: #79 to #85 (October 2026)

## Next Steps

- [ ] Ross reviews and merges the PR (merging deploys to GitHub Pages)
- [ ] Ross picks from "For Ross to decide"
