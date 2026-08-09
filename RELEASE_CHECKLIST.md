# Release Checklist

This checklist separates repository configuration from files in the repository.
A checked-in workflow does not prove that the corresponding GitHub or npm
setting is enabled.

## One-time repository setup

- [ ] Enable the dependency graph under **Settings → Security → Advanced
      Security**. Confirm the `Dependency review (SCA)` workflow succeeds on a
      test pull request before making it required.
- [ ] Enable Dependabot alerts and Dependabot security updates. The checked-in
      version-update configuration covers `/`, `/examples`, the patch-pinned
      React 17 compatibility fixture, and GitHub Actions, but those repository
      settings are separate.
- [ ] Enable private vulnerability reporting. Confirm the **Report a
      vulnerability** button is visible to a user who does not administer the
      repository before linking directly to the advisory form.
- [ ] Enable secret scanning and push protection if they are available for the
      repository plan.
- [ ] Protect `main` with a branch rule or ruleset requiring pull requests,
      successful CI, examples, handheld integration, CodeQL, and
      dependency-review checks. Restrict force pushes and deletion. Require
      Code Owner review once a second qualified reviewer is available; a sole
      maintainer cannot approve their own pull request.
- [ ] Keep the default GitHub Actions token permission read-only. Separately
      enable **Allow GitHub Actions to create and approve pull requests** so the
      Changesets action can maintain its version pull request. The workflow's
      job-level permissions remain the upper bound.
- [ ] Restrict allowed Actions to GitHub-owned and explicitly reviewed actions.
      Pin action references to reviewed full commit SHAs and let Dependabot
      propose updates.
- [ ] Verify `CODEOWNERS` resolves to accounts with review access. Once the
      repository has a second qualified reviewer, require Code Owner review and
      dismissal of stale approvals in the branch rule.

## One-time npm setup

- [ ] Confirm the package name, public visibility, repository URL, license,
      exports, files, and ownership are correct. Do not treat a version in
      `package.json` as evidence that the package exists on npm.
- [ ] Keep the exact npm CLI installed by `release.yml` in sync with the
      `packageManager` field, and verify that version still supports trusted
      publishing before changing either value.
- [ ] If the package has never been published, use npm's current documented
      bootstrap process from a clean, reviewed commit. Do not put a bootstrap
      token in GitHub Actions. Revoke any temporary credential immediately after
      use.
- [ ] On npm, configure a GitHub Actions trusted publisher with these exact
      values:

      | Field | Value |
      | --- | --- |
      | Repository owner | `SauceTaster` |
      | Repository | `spatial-nav-css` |
      | Workflow filename | `release.yml` |
      | Environment | leave empty (the workflow does not declare one) |
      | Allowed action | `npm publish` |

      npm validates the identity only when publishing, so re-check spelling and
      case. If a GitHub environment is later added to the workflow, update the
      trusted-publisher identity at the same time.
- [ ] Require strong two-factor authentication for npm maintainers and remove
      unused automation or granular publish tokens. The release workflow uses
      OIDC and must not receive an `NPM_TOKEN`.

Official references: [npm trusted
publishing](https://docs.npmjs.com/trusted-publishers/), [GitHub private
vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository),
and [GitHub dependency
review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review).

## Pull request and release preparation

- [ ] Every user-facing change has an accurate Changeset; remove duplicate,
      obsolete, or misleading pre-release Changesets.
- [ ] Claims in the README and docs match tested behavior and current external
      standards. Compatibility claims have a named test target.
- [ ] `npm ci` and `npm run ci` pass from a clean checkout on a supported Node.js
      version using the exact `packageManager` npm version.
- [ ] Before the first publish, remove or replace the pre-release/unpublished
      notices in `README.md` and `docs/guide.md` in the reviewed version pull
      request; those files ship in the npm tarball and Changesets will not edit
      the wording automatically.
- [ ] The example package installs from its lockfile and passes typecheck, tests,
      and production build.
- [ ] The private `handheld-os` integration harness installs independently and
      passes typecheck, application tests, real-browser Storybook/a11y tests,
      production build, and Storybook build.
- [ ] `npm pack --dry-run` contains every required runtime, type, CSS, license,
      and documentation file and no secrets, local artifacts, or unintended
      source files.
- [ ] Install the generated tarball in a temporary consumer project and smoke
      test ESM, CommonJS, declared subpath exports, types, CSS, and a server-side
      import.
- [ ] Load `dist/spatial-nav.global.js` from the tarball via a plain `<script>`
      tag and confirm `window.SpatialNav` drives a page (the `unpkg`/`jsdelivr`
      CDN path). Confirm `llms.txt` and a fresh `llms-full.txt`
      (`npm run check:llms`) are in the tarball.
- [ ] Run `npm run audit:all` and review production and development findings for
      all four lockfiles: root, `examples/`, `handheld-os/`, and
      `tests/compat/react17/`.
      Resolve, document, or explicitly accept each finding; dependencies outside
      the published tarball can still compromise CI or contributors.
- [ ] Review the diff from the last release, version number, license and
      third-party notices, generated declarations, and changelog text.

## Publishing through Changesets

- [ ] Merge normal changes with Changesets to `main` and confirm the Release
      workflow creates or updates the version pull request. If it cannot create
      a pull request, verify the GitHub Actions setting above rather than adding
      a personal token.
- [ ] Review the version pull request as a release artifact: versions,
      changelog, lockfile, generated package surface, and pending Changesets.
- [ ] Merge the version pull request only from a protected `main` branch. The
      subsequent Release workflow publishes with a short-lived OIDC credential
      and provenance; no long-lived npm credential should be present.
- [ ] For `workflow_dispatch`, inspect the selected branch and commit before
      approving the run. Manual dispatch does not bypass Changesets or the
      trusted-publisher identity.

## Post-release verification

- [ ] Confirm the expected version, dist-tag, license, repository link, and
      provenance are visible on npm.
- [ ] Download the registry tarball and compare its contents with the reviewed
      pack output. Run the consumer smoke tests against the registry artifact.
- [ ] Confirm the Git tag and GitHub release point to the published commit and
      that release notes match the final changelog.
- [ ] Test the documented install command in a new project without repository
      files or undeclared dependencies.
- [ ] If verification fails, stop further releases, document impact, deprecate a
      bad version when appropriate, and publish a corrected version. Do not
      overwrite a published version or rely on unpublishing as routine recovery.
