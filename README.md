# csv-reader-speed-01-run-20261121

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ruri08219/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ruri08219/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

## About

A faster drop-in for make.fun's own csv-reader 1.0.0, for the
[make.fun csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
"Read broken CSV files faster, 21 November 2026". It answers exactly as
csv-reader 1.0.0 does on every case — same `{columns, rows, errors}` for
BOM, LF/CRLF, stray CRs, quoted fields, doubled quotes, quote junk,
unterminated quotes, short/long rows — and does it faster.

## How it works

`solve.js` exports `run(input)`. Where the reference walks the text one
character at a time, this reader works with whole spans: a record whose
first line holds no quote is split in one go (C++ `split`), stray CRs
counted and stripped; any other record is parsed field by field, each
unquoted field found with a couple of `indexOf` calls and taken as one
slice, each quoted field found with `indexOf('"')` and taken as slices,
with CR/CRLF inside quotes normalised to LF. Quoted fields that span
lines, unterminated quotes, quote junk and every error follow the
reference exactly. Pure: no clock, no randomness, no locale, nothing
kept from one call to the next. Dependency-free ES module; `main.ts` is
the kit's driver (reads `/input/cases.json`, writes
`/output/answers.json`).

Local practice set (6 cases, ~10.2 MB of CSV, kit scorer): 6/6 cases
identical to the oracle, byte-for-byte, and the official
`grade-local --driver process` run passes (passed 1, L1 regrade
reproduced byte for byte). Solve time on this machine, warmed, median
~0.22 s against the reference's ~0.71 s on the same set (~3.2x); whole
`main.ts` run ~0.96 s of CPU against the baseline's ~1.84 s (~1.9x).

## Run it

Grade it locally with the kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process
```

License: MIT.
