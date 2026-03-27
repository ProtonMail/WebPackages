# Packages

## Releasing changes

This repo uses [Changesets](https://github.com/changesets/changesets) with [changesets-gitlab](https://github.com/un-ts/changesets-gitlab) to automate versioning and publishing.

### As a contributor

Every MR that changes a package should include a changeset describing what changed and how it affects the public API.

1. Run `pnpm changeset` and follow the prompts — select the affected packages and bump type (`major`, `minor`, or `patch`)
2. Commit the generated `.changeset/*.md` file along with your changes
3. Open your MR — a bot will comment on it confirming the changeset was found

If you forget, the CI `changeset:comment` job will warn you (it's non-blocking, but please add one).

### How releases work

When your MR is merged into `main`, CI automatically runs `changesets-gitlab`, which does one of two things depending on the state of pending changesets:

- **Pending changesets exist** — it creates (or updates) a "Version Packages" MR that bumps all affected package versions and updates changelogs
- **"Version Packages" MR was just merged** — it publishes the updated packages to the registry

So the flow is:

```
feature MR (with changeset) → merge to main
  → CI creates "Version Packages" MR
  → merge "Version Packages" MR
  → CI publishes packages
```

You do not need to manually run `changeset version` or `changeset publish`.
