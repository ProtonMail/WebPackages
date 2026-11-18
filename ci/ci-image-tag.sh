#!/bin/sh
#
# Works out the CI image for this pipeline and writes it to ci-image.env, for the jobs to
# use as CI_IMAGE. The tag is a hash of the files the image is built from and the Playwright
# version in pnpm-lock.yaml, so changing any of them gives a new tag.
#
# Also writes whether the image exists already, so ci-image:build can skip the build. Fails
# when the image is missing and this pipeline does not build it (CI_IMAGE_BUILD is not true).
#
# Usage: ci-image-tag.sh <image name>

set -eu

image=$1

playwright=$(sed -n 's/^  playwright@\([0-9.]*\):$/\1/p' pnpm-lock.yaml | head -n 1)
if [ -z "$playwright" ]; then
    echo "Found no playwright version in pnpm-lock.yaml" >&2
    exit 1
fi

tag=$(echo "$playwright" | cat ci/Dockerfile ci/configure-apt-pkg-mirror.sh .npmrc - | sha256sum | cut -c 1-16)
# Only Harbor's NOT_FOUND means the image is missing. Any other error, such as a network
# failure or UNAUTHORIZED, fails the job instead of rebuilding or blaming a missing image.
exists=false
if error=$(crane manifest "${image}:${tag}" 2>&1 > /dev/null); then
    exists=true
elif ! echo "$error" | grep -q NOT_FOUND; then
    echo "$error" >&2
    exit 1
fi

cat > ci-image.env << EOF
CI_IMAGE=${image}:${tag}
CI_IMAGE_TAG=${tag}
CI_IMAGE_EXISTS=${exists}
PLAYWRIGHT_VERSION=${playwright}
EOF
cat ci-image.env

if [ "$exists" = false ] && [ "${CI_IMAGE_BUILD:-}" != true ]; then
    echo "${image}:${tag} does not exist and this pipeline does not build it." >&2
    echo "Run a pipeline with the variable CI_IMAGE_BUILD=true to build it." >&2
    exit 1
fi
