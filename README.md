# Web packages

This project is a monorepo hosting Proton web packages that are used across web codebases.

Technically, this monorepo is based on pnpm Workspaces, with separate versioning for all packages inside (via [Changesets](https://github.com/changesets/changesets)).

## Getting Started

### Prerequisites

You'll need to have the following environment to work with this project:

- Node.js LTS
- pnpm (or corepack)
- git

See `package.json` for specific version requirements.

### Installation

```shell
# Clone the project
git clone https://github.com/ProtonMail/WebPackages.git
git clone git@github.com:ProtonMail/WebPackages.git

# Install all dependencies for the entire monorepo
pnpm install
```

## Help us to translate the project

You can learn more about it on [our blog post](https://proton.me/blog/translation-community).

## License

The code and data files in this distribution are licensed under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See https://www.gnu.org/licenses/ for a copy of this license.

See [LICENSE](LICENSE) file
