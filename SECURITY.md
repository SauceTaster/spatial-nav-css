# Security Policy

## Supported versions

While the project is on `0.x`, security fixes are made for the latest released
minor version. Older minor versions and unreleased snapshots are not supported.
Check the npm registry or the repository's releases page for the latest release;
the version in a source checkout may be ahead of what has been published.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue, discussion,
pull request, or social-media post.

1. If the repository's **Security** tab has a **Report a vulnerability** button,
   use it to open a private GitHub security advisory.
2. If that button is absent, private vulnerability reporting has not been
   enabled. Open a minimal public issue titled `Private security contact
   requested` containing no vulnerability details, affected versions, proof of
   concept, logs, or identifying information. A maintainer will arrange a
   private channel before asking for details.

Include the affected version, impact, reproduction steps, and any suggested
mitigation once a private channel exists. Maintainers aim to acknowledge a
complete report within three business days, but this is a volunteer-maintained
project and that target is not a service-level guarantee.

Reports about community conduct follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md),
not the security-advisory channel.

## Relevant security surface

Useful areas to examine include values that reach DOM selectors, activation
events that can cause application code to run, focus changes across document or
shadow boundaries, and input adapters that handle untrusted browser events. A
report is still welcome when it falls outside those examples.

## Repository security controls

The repository contains workflows and configuration for the following controls.
Some controls also require a repository or npm setting and are not active merely
because the configuration file exists:

- CodeQL is configured for pull requests, pushes to `main`, and a weekly scan.
- Dependency review is configured for pull requests. Repository administrators
  must enable the dependency graph before that workflow can provide protection.
- Dependabot version updates cover the root package, the `examples` package,
  patch updates for the React 17 compatibility fixture, and GitHub Actions.
  Dependabot alerts and security updates must be enabled separately in
  repository settings.
- The release workflow is designed for npm trusted publishing with OIDC and does
  not require a long-lived npm publish token. It cannot publish until the exact
  repository and workflow identity are registered as a trusted publisher on
  npm.
- Workflows declare explicit permissions. Branch protection or a ruleset must
  still make the required checks mandatory before merging.
- The core package has no declared runtime dependencies. Framework adapters use
  optional peer dependencies, and development/example dependencies remain part
  of the supply-chain threat model.

The one-time settings and verification procedure are listed in
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Until an item there is enabled and
verified, do not describe it as an active protection.
