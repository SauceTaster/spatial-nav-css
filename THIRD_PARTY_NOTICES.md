# Third-Party Notices and Attribution

This project is MIT-licensed. This file records named technical influences and
third-party notices; it is not a list of installed npm dependencies. Dependency
licenses must also be reviewed from the lockfiles and packed artifact before a
release.

## Norigin Spatial Navigation

Repository history and source comments identify
[Norigin Spatial Navigation](https://github.com/NoriginMedia/Norigin-Spatial-Navigation)
as a source studied for production-TV behavior, including focus restoration,
input throttling, debug visualization, and directional scoring. This notice is
retained conservatively so that the influence and the upstream MIT terms remain
visible.

### Pinned audit baseline

The original project history names the upstream repository but does not record
the checkout that was studied. For a reproducible comparison, the provenance
audit pins upstream commit
[`2a0924b8520fe6b0b23e19f16b33c155b884f534`](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/commit/2a0924b8520fe6b0b23e19f16b33c155b884f534),
dated `2026-06-18T15:27:31+02:00` and tagged for upstream's 3.2.0 package
releases. It was the last commit on upstream `main` before this repository's
initial commit (`38ceba932cab544f6dc6b4d5fec2dc308a67cd79`, dated
`2026-06-20T19:21:54-07:00`). This is the closest verifiable historical
baseline, not a claim that the original author checked out that exact SHA.

The 2026-08-05 audit compared the current project against these upstream files
at the pinned revision:

- [`packages/core/src/SpatialNavigation.ts`](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/2a0924b8520fe6b0b23e19f16b33c155b884f534/packages/core/src/SpatialNavigation.ts),
  including adjacent-slice scoring, key-event throttling, last-focused-child
  tracking, and debounced focus restoration after component removal.
- [`packages/core/src/VisualDebugger.ts`](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/2a0924b8520fe6b0b23e19f16b33c155b884f534/packages/core/src/VisualDebugger.ts),
  including its fixed canvas overlays for layouts and scoring points.

### File-level conclusion

- `src/core/types.ts` and `src/core/geometry.ts`: the default `0.2` aligned
  overlap ratio and the thresholded orthogonal interval-overlap test correspond
  closely to upstream's `ADJACENT_SLICE_THRESHOLD` and `isAdjacentSlice`.
  Repository history calls this rule "adopted". The local scoring model is
  otherwise different, but these files are treated conservatively as an
  adapted implementation rather than an ideas-only influence. No non-trivial
  upstream source line appears verbatim.
- `src/core/engine.ts`: focus memory and delayed recovery after removal are
  behavior-level influences only. Upstream manages registered focus-key
  components and calls a 300 ms Lodash-debounced `setFocus(parentFocusKey)`;
  this project observes DOM removal, keeps element/container state in a
  `WeakMap`, and runs its own 100 ms restoration cascade. No copied upstream
  implementation expression was identified.
- `src/input/keyboard.ts`: time-based leading-edge throttling and clearing the
  gate on key release are behavior-level influences only. Upstream wraps its
  keydown handler with Lodash `throttle`; this project uses its own timestamp,
  physical-key, focus-ownership, and lifecycle state. No copied upstream
  implementation expression was identified.
- `src/debug/index.ts`: the concept of visualizing navigation geometry is a
  behavior-level influence only. Upstream continuously paints two canvas
  layers; this project creates inspectable positioned DOM boxes and refreshes
  them from focus, scroll, resize, and explicit calls. No copied upstream
  implementation expression was identified.
- `tests/geometry.test.ts`, `tests/auto-restore.test.ts`,
  `tests/keyboard.test.ts`, `tests/debug.test.ts`, and
  `.changeset/norigin-lessons.md` exercise or describe those local behaviors;
  the audit found no copied upstream test or documentation text in them.

A manual comparison plus a normalized exact-line scan found no matching
non-trivial code lines in the current files listed above. No other current
project file was identified as containing Norigin implementation expression.
The MIT notice is nevertheless preserved in full, especially because the
alignment rule is intentionally treated as an adaptation.

> MIT License
>
> Copyright (c) 2022 NoriginMedia
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Standards and product references

The project refers to the W3C/CSS Working Group's
[CSS Spatial Navigation Level 1](https://www.w3.org/TR/css-nav-1/) and
[Gamepad](https://www.w3.org/TR/gamepad/) specifications for terminology and
interoperability context. A reference does not mean that W3C endorses this
project or that the implementation conforms to either specification.

Valve Panorama, Steam, Steamworks, Steam Deck, Dota, Counter-Strike, Xbox,
PlayStation, Nintendo, webOS, Tizen, and other product or platform names appear
only to describe inspiration, host behavior, or compatibility targets. This is
an independent project and is not affiliated with, sponsored by, or endorsed by
NoriginMedia, Valve, W3C, Microsoft, Sony, Nintendo, LG, Samsung, or other named
vendors. All trademarks, product names, and logos belong to their respective
owners.

No vendor SDK, product artwork, logo, or trademark license is granted by this
project.

## Adding third-party material

Contributors must identify copied or adapted code, documentation, data, media,
and generated material in the pull request. Record the source URL, version or
commit, author or copyright holder, license, files affected, and material
changes. Preserve attribution and license text when required, and do not add
material with unknown or incompatible terms.
