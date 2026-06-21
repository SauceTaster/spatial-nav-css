# Security Policy

## Supported versions

The latest minor release receives security fixes.

## Reporting a vulnerability

Please use **GitHub private vulnerability reporting** ("Report a
vulnerability" under the repository's Security tab) rather than opening a
public issue. You should receive an acknowledgment within a few days.

Please include a proof of concept where possible. The interesting surface
for this library: selector injection via `data-nav-*` / `--nav-*` values
(they are passed to `querySelector`), synthetic click dispatch on activate,
and anything that lets a page escalate from "navigates focus" to "executes
unexpected code".

## Hardening in this repository

- CodeQL (`security-and-quality` suite) runs on every PR, push to `main`,
  and weekly (SAST).
- Dependency review blocks PRs introducing known-vulnerable dependencies
  (SCA); Dependabot keeps dependencies and Actions current.
- Workflows run with least-privilege `permissions:` blocks.
- npm releases are published with provenance attestation.
- The library itself has **zero runtime dependencies**.
