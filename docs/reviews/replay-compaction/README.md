# Context compaction replay validation

## Large-input parser fixes (2026-11-02)

JSON tokens now retain slices of each decoded input chunk and join once at token completion.
Quoted strings and numeric/literal tokens no longer create a concatenation node per character.
Escaping state survives chunk boundaries; completed records still wait for document EOF and
body ordering dependencies before display. Raw files and archive checks are unchanged.

The MathJax delimiter adapter reuses the pinned plugin's public syntax/AST exports. For each
inline/display construct and text context, a failed scan to EOF caches its source interval.
Later openings in that interval cannot find a closer either, so they fall back immediately.
Earlier positions, other delimiter types, paragraphs and documents remain independent. No
text replacement, dependency update, node_modules patch or rendering-stack change is needed.

Regression evidence:

- Before implementation, all four new regressions failed: three tokenizer work bounds and
  the Chromium heap budget. After the fixes, all pass. The tokenizer checks count consumed
  input rather than comparing wall-clock time, avoiding timing-sensitive CI assertions.
- 182 focused replay/package/mock-contract unit tests passed. Typecheck and scoped Biome
  passed. Seven mock browser scenarios passed, covering independent slow/error/archive
  reviews and desktop/mobile compact/formula rendering. Nine sitemap checks passed; the
  128 replay URLs retain the same actual modification date, 2026-11-02.
- Run the standalone V8 regression with
  `bun test tests/integration/replay-parser-memory.test.ts`. It passed with a 16 MiB string
  split into 64 KiB chunks and an eight-times-payload additional-heap budget. This browser
  check is separate from the Bun unit suite; Bun uses a different JavaScript engine.
- An identical Chromium probe measured about 350 MiB / 423 ms before and 33 MiB / 65 ms after.
  These are maximum sampled JS heap readings during input pulls/completion, not RSS or a
  strict instantaneous peak. GC and machine load affect the exact readings.
- Actual component SSR for a 32 KB paragraph of unclosed delimiters improved from about
  3.22 seconds to 154 ms; the fixed 64 KB case took 200 ms. Browser KaTeX rendering passed,
  but these malformed-formula timing figures measure SSR, not browser freeze duration.
- Independent review compared 20,000 randomized Markdown ASTs against the original plugin
  and 2,000 randomly chunked JSON documents against their source values without differences.
  No remaining blockers were found. Full repository suites, local production build and live
  deployment were not run for this follow-up. Previous baseline limitations still apply.

## Current scope (2026-11-02)

The optional ordered replay format and its Web consumer were withdrawn at the user's
request. Publisher PR #23 is closed. This change uses only existing published files;
no re-publication, extraction changes or deployment/runtime configuration changes are
required. Session and review downloads run concurrently. The body waits for the complete
session and required Notebook metadata, then sorts, filters compaction and reveals whole
blocks in contiguous batches. Reviewer cards load independently and can be retried without
changing the body. Download-time conversation rendering is not promised: later records
can precede or regroup earlier records in the existing format.

The 128 replay URLs in the existing snapshot now use template date **2026-11-02**;
gallery/overview dates remain unchanged. The sections below record earlier validation.

Fresh verification after withdrawal: 177 focused replay/package/mock-contract unit tests,
8 targeted browser scenarios (slow reviews, review failure/retry, archive review fallback,
partial body failure, desktop/mobile compact and math rendering), typecheck and 9 sitemap
snapshot tests passed. Scoped Biome reported no errors and the existing console warning.
The new regression holds a partial session containing a complete later message, then
appends an earlier message: no body is exposed before final ordering, and only existing
metadata URLs are requested. Full repository suites and a local production build were not
rerun; historical baseline limitations below still apply. No live deployment was performed.

The replay parser projects structurally identified `ContextCompaction` activities into
status-only rows. Both extracted metadata and verified archives use this projection;
source packages remain unchanged. Unmarked summaries in older ordinary messages are
outside this change because their identity cannot be established safely from prose.

Validation on 2026-10-30:

- `bun run test:unit`: 558 passed.
- `bun run typecheck`: passed.
- `bun test ./tests/integration/mock-development.test.ts --test-name-pattern 'compaction replay'`:
  4 passed, covering desktop/mobile and extracted/archive paths, HTTP 200, copy behavior,
  ordinary messages/assets, safe labels and excluded provider payloads.
- Biome checks on the 11 changed TypeScript/TSX files and `git diff --check`: passed.
- Full-repository lint: 15 errors in untouched files; not a passing check.
- Earlier browser runs encountered an intermittent Shiki external-module SSR error,
  also reproduced in an unmodified `12cb4f6` snapshot with the same installed dependencies.
  Restarting the mock server subsequently returned HTTP 200 and the strict regression
  passed. No runtime, dependency, deployment or environment configuration was changed.

[Sitemap impact](./sitemap-impact.csv) lists all 128 concrete replay URLs from the
published manifest snapshot retrieved on 2026-10-30. Their template date source is
`OPEN_SCIENCE_USE_CASE_REPLAY_LAST_MODIFIED = '2026-10-30'` in `app/sitemap.ts`.
A separate local sitemap run using that snapshot checked every listed URL. Existing
sitemap tests also verify unchanged gallery/overview dates and excluded routes.

## Initial idle-download and progressive-rendering validation

The follow-up keeps the existing export format. A published Wordle session was inspected:
`messages` precedes `artifacts` and `conversationGraph`, and the current viewer merges
messages by `createdAt` with activities by epoch-scale `sortIndex` (falling back to
`createdAt`). Adjacent activities are grouped only after that merge. Notebook runs,
Reviewer records and asset associations must also resolve before blocks are final.
There is no declared streaming order or watermark in the export.

The reader incrementally assembles complete JSON values across byte chunks, but buffers
all records until document EOF and dependencies are complete. Verified archive parsing
remains behind the existing size, SHA-256 and inventory checks. The final display model,
including compaction filtering and group/turn boundaries, is then revealed in batches of
eight complete blocks. Previously displayed block identities and grouping remain stable.
If the worker fails during this phase, visible blocks and their asset URLs remain available
until retry/unmount, with an incomplete-loading warning. A download failure before the
ordering barrier has no safe visible prefix to preserve.

Downloads now use a 30-second first-nonempty-body-chunk deadline and a renewable 30-second
idle deadline. Headers and empty chunks do not extend the wait. EOF, errors and cancellation
clear timers; unmount terminates the worker and clears scheduled rendering and owned URLs.

Follow-up validation on 2026-10-30:

- Full unit suite: 589 passed; focused suite: 110 passed.
- Typecheck passed. Scoped Biome checks passed with one existing console warning.
- Seven targeted mock/browser scenarios passed: desktop/mobile compaction through both
  loading paths, metadata and archive downloads lasting about 36 seconds each, and a worker
  transport failure preserving the rendered prefix and showing the incomplete warning.
- Timeout tests use a controlled clock for first-byte waits, empty chunks, stalled bodies,
  cancellation, errors and EOF cleanup. Byte-by-byte parsing tests cover UTF-8, escapes,
  malformed/truncated records, Markdown/code/tables and deferred out-of-order dependencies.
- The first slow-browser run matched Next.js's empty route-announcer alert in an overly broad
  assertion; the assertion now checks the actual replay error text, and all seven reran successfully.
- After caching finalized row elements to avoid rendering earlier Markdown again in each batch,
  all 589 unit tests, typecheck and the five affected UI scenarios passed again. Follow-up review
  found no remaining actionable issues. The full mock suite and production build were not rerun.
- All affected replay URLs retain the same task date, `2026-10-30`, in the existing sitemap
  inventory. No publishing, dependency, deployment or runtime configuration was changed.

This improves parsing and final rendering responsiveness; it does not promise a first block
before all legacy metadata downloads finish. Supporting that would require a separately
reviewed publisher-generated, version-bound ordered block stream with complete dependencies.


## Independent Reviewer loading

The final extracted loader starts `session.json` and `records.json` concurrently. Notebook
runs depend on project/session identifiers and start after the session is parsed. The body
waits only for its complete session and Notebook dependencies, then receives the same
sorted, grouped and compact-filtered model as before. Extracted artifact/upload URLs derive
from session metadata; they do not require records tables.

Reviewer cards use a separate worker reply and loading state. JSON values are assembled
incrementally, but reviews are not published until records EOF: later Finding, disposition
and ArtifactVersion tables can change completeness and ordering. Normalization sorts cards
by createdAt/id and checks by their existing deterministic order. Only review slots consume
new data; cached body rows and their full-turn markers remain unchanged. Errors use the
fixed notice “评审加载未完成” and review-only retry. Both streams finish/cancel their existing
idle timers; the worker remains available for retry after review failure and is terminated
once body and reviews finish or the page unmounts. Owned Blob URLs survive until unmount.

Archive-only replay remains conservative: its records tables also resolve attachment
filenames and upload mappings, so body rendering waits for them and all existing integrity
checks. A missing extracted records fallback runs independently of the body and still
verifies the archive and session match. No original data, publication format, deployment or
runtime configuration changes are included. Affected sitemap URLs retain the same actual
modification date, 2026-10-30, as the earlier change in this PR.


Validation for independent reviews (2026-10-30):

- 123 focused unit/contract tests passed, including body dependency barriers, cross-chunk
  association ordering, review-only retry, active records downloads beyond 30 seconds,
  stalled records, invalid-session cancellation and unmount/late-response handling.
- Typecheck passed. Scoped Biome has no errors and one pre-existing console warning.
- The full unit run reported 583 passed and 15 failures: configured `SITE_DOMAIN` resolves
  to `https://www.aipoch.xyz`, while untouched metadata tests expect `https://aipoch.com`.
  The untouched page-metadata test reproduces this mismatch in a separate run. No environment
  or operational settings were changed to make those assertions pass.
- The full mock integration run reported 41 passed and 17 failed. Three stale replay/date
  expectations were updated for the new review-only error/retry flow, coalescible short
  parsing status, and the existing PR's 2026-10-30 sitemap date. Remaining failures are in
  unchanged homepage/blog/skill/leaderboard scenarios and a mobile download font-size
  expectation. They are recorded as unresolved full-suite failures, not a passing baseline.
- Final targeted browser rerun: 7 passed, including the three updated expectations, three
  independent-review scenarios and interrupted-body preservation.
- The slow-records browser case passes with about 37 seconds of continuous download while
  the complete body is already displayed. Failure and verified-archive-fallback failure both
  keep body block nodes and complete Markdown/code/table text stable through review retry.
  The first version compared whole HTML and also observed normal asynchronous syntax
  highlighting/thumbnail updates; the assertion now checks body identity and semantic content.
- Acceptance screenshots remain local or GitHub attachments, never tracked repository files.
  No local production build was run for this follow-up.

## MathJax delimiter rendering

Source: [molecular-handedness replay](https://aipoch.com/open-science/use-cases/99-pure-does-molecular-handedness-matter/replay), message
`message-stream-6d050fddf2784ecc`. The downloaded, unchanged `extracted/session.json`
has SHA-256 `0ddf485dc34ec9fdb6c65a02dc71b7cab4092a097aa917a770017b9e46c1aca1`.
Decoded text uses single-backslash `\(...\)` and `\[...\]` delimiters, with correctly
escaped `\%` inside formulas; JSON represents each backslash as `\\`. Ordinary prose
percent signs need no conversion.

`remark-mathjax-delimiters@0.1.0` was checked against the installed Streamdown 2.6.0
and its existing KaTeX integration. Default remark/GFM plugins remain enabled.
The upstream parser nests display math inside paragraphs: a small AST transform lifts
those math nodes to flow level. Inline wrappers retain their formatting and links;
only the standard `math-display` code class is additionally allowed through sanitation.
No source-text regex or export rewrite is used. Static mode and incomplete-Markdown
settings, body ordering, compaction filtering and archive verification are unchanged.

Validation on 2026-10-30:

- Initial regression: 5 failing formula cases before the fix, 9 passing protection cases.
- 20 math regressions cover inline/display, `$`/`$$`, mixed delimiters, escaped delimiters,
  literal and TeX-comment percent signs, code, unclosed delimiters, GFM tables, nested
  formatting and direct/reference links. The link tests also cover a review finding.
- 172 focused replay/package unit tests pass; TypeScript and scoped Biome checks pass.
- Desktop/mobile renderer and compact-safety browser tests use the real mock launcher,
  export worker and replay UI. Math assertions check KaTeX nodes, display structure,
  TeX annotations, plain text and code preservation.
- A separate browser check feeds the unchanged original session bytes to the local
  replay route on desktop/mobile: seven KaTeX nodes, one display formula, no KaTeX
  errors and no page errors. Optional Notebook metadata and Reviewer records are
  stubbed for this rendering check; it is not a live-backend integration test.
- The public URL returned HTTP 200, but the probe did not observe the transcript within
  60 seconds. No deployment or production verification is claimed.
- One source table formula contains unescaped `|` (`100|L-R|/(L+R)`), which GFM treats
  as column boundaries before inline parsing. That malformed cell remains unsupported;
  this change neither guesses table structure nor rewrites the source.
- Screenshots are GitHub PR attachments, not repository files. Runtime/build scripts,
  deployment settings and environment files are unchanged; only the parser dependency
  and its lock entry are added. Existing replay sitemap dates remain 2026-10-30 for
  the same 128 canonical replay URLs listed above; no gallery/overview date changes.
