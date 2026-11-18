#!/usr/bin/env bash
#
# Points apt at the Debian mirror on pkg.protontech.ch (artifact-keeper) instead of
# deb.debian.org and security.debian.org, for the Debian release of the current image.

set -euo pipefail

. /etc/os-release

cat > /etc/apt/sources.list << EOF
deb https://pkg.protontech.ch/debian/deb-public ${VERSION_CODENAME} main
deb https://pkg.protontech.ch/debian/deb-public ${VERSION_CODENAME}-updates main
deb https://pkg.protontech.ch/debian/deb-public ${VERSION_CODENAME}-security main
EOF
rm -f /etc/apt/sources.list.d/debian.sources
