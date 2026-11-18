# Image for the jobs in .gitlab-ci.yml, with git and the Playwright browsers and system
# packages the crypto browser tests need already installed. The ci-image job tags it with a
# hash of this file, the files it copies and the Playwright version in pnpm-lock.yaml, so
# changing any of them builds a new image.
FROM harbor.protontech.ch/docker.io/library/node:24.22.1-slim

ARG PLAYWRIGHT_VERSION

# The slim image has no CA certificates, which apt needs to reach the https mirror until it
# has installed ca-certificates itself.
COPY --from=harbor.protontech.ch/docker.io/library/node:24.22.1 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# npx reads the registry from the .npmrc in its working directory.
WORKDIR /tmp/playwright
COPY .npmrc ci/configure-apt-pkg-mirror.sh ./

RUN bash configure-apt-pkg-mirror.sh \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git xvfb libpci3 \
  && npx --yes "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium firefox \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /root/.npm

# The node user ships with the base image. Global npm installs (pnpm in the jobs) go to its
# home, since it cannot write to /usr/local.
USER node
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=/home/node/.npm-global/bin:$PATH

# Installs the browsers into ~/.cache/ms-playwright, where the tests look for them. The
# tests run headless, which only needs Chromium's headless shell.
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --only-shell chromium firefox \
  && rm -rf /home/node/.npm

WORKDIR /home/node

# CI jobs run to completion, there is no long-running service to check.
HEALTHCHECK NONE
