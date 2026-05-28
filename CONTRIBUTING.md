# Contributing

## Contributing Guidelines

Thank you for your interest in contributing to this open source project!
We welcome contributions from everyone.
Please read the following guidelines to help ensure a smooth collaboration:

### Opening Issues

- **Search first**: Before opening a new issue, please check if your question, bug, or feature request has already been reported.
- **Provide details**: When opening an issue, include as much relevant information as possible (steps to reproduce, expected/actual behavior, screenshots, environment, etc.).
- **Be respectful**: Use clear and respectful language.

### Opening Pull Requests (PRs)

- **Fork and branch**: Fork the repository and create a dedicated branch for your changes.
- **Describe your changes**: Clearly explain what your PR does and why.
  Reference related issues if applicable.
- **Tests and documentation**: Add or update tests and documentation as needed.
- **Small, focused PRs**: Smaller, focused changes are easier to review and merge.
- **Review process**: All PRs are subject to review by maintainers.
  Please be responsive to feedback and update your PR as needed.

### Rights and Licensing

- **Ownership**: By contributing, you confirm that you have the rights to submit the content you are providing (code, documentation, etc.).
- **License compliance**: All contributions must be compatible with the project's [MIT License](./LICENSE).
  Do not submit content you do not have the right to share, or that is incompatible with the MIT license.

### Release Process

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and releases.
When your contribution is ready to be included in a release, please follow these steps as part of the pull request process:

1. **Create a Feature Branch**: Make your changes in a dedicated feature branch.
2. **Add a Changeset**: Run `npx changeset add` to generate a release note entry.
   You will be prompted to select the impact of your change (major, minor, or patch) and provide a description.
3. **Open a Pull Request**: Push your changes and open a PR.
   A GitHub Actions bot will comment on the PR with the potential release impact.
   If you forgot to add a changeset, maintainers can add one via the GitHub UI.
4. **Review and Merge**: After review, your PR will be merged into the default branch (`main`).
   This triggers a [GitHub workflow](/.github/workflows/release.yaml) that creates a `Merge to release` PR.
   Merging the feature PR does not immediately trigger a release; the version bump and release process is handled separately to allow for batching multiple changes together if needed.
5. **Version Packages PR**: Maintainers review and approve the version bump PR (`Merge to release` PR).
   Once merged, the workflow will:
   - Publish packages to NPM
   - Create Git tags
   - Generate a GitHub release
   - Update the `CHANGELOG.md`
   - Remove processed changeset files

Using Changesets allows for precise control over releases and supports versioning multiple packages at once.

**Resources:**

- [Changesets GitHub repository](https://github.com/changesets/changesets)
- [Common Questions about Changesets](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)

### Code of Conduct

We are committed to fostering a welcoming and inclusive environment.
Please be respectful and considerate in all interactions.
If you experience or witness unacceptable behavior, please report it to the maintainers.

## Maintainer Guidelines

Since this is a collaborative project, we aim to have at least 2 to 3 active maintainers.

When a PR is opened, it is automatically assigned to these active maintainers.
Besides the CI passing, a PR requires the approval of at least 2 maintainers before it gets merged.
If a PR receives only one approval, and the PR remains open for 4 weeks, then it can be merged as well. To not delay progress too much if other maintainers are unavailable. (unless one of the maintainers explicitly requests waiting for an additional review)
If a maintainer makes a PR it only requires approval of 1 additional maintainer (since we already have the author approval).