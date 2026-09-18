import {getImageReference, buildImageFromDockerfile, type ImageBuild} from '../../docker'
import {DEFAULT_DOCKER_IMAGE} from '../constants'

const COPILOT_CLI_VERSION = '1.0.85'

const DOCKERFILE = `ARG BASE_IMAGE

FROM \${BASE_IMAGE}

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/agent-eval/node/bin \
    && cp /usr/local/bin/node /opt/agent-eval/node/bin/node

# Copilot CLI setup
ARG COPILOT_CLI_VERSION
RUN curl -fsSL https://gh.io/copilot-install -o /tmp/install-copilot.sh \
    && VERSION="\${COPILOT_CLI_VERSION}" \
       PREFIX=/opt/agent-eval/copilot \
       PATH="/opt/agent-eval/copilot/bin:$PATH" \
       bash /tmp/install-copilot.sh \
    && rm /tmp/install-copilot.sh

# Copilot SDK setup
# COPY sdk-runner/package.json /opt/agent-eval/sdk-runner/
# RUN npm ci --omit=dev --prefix /opt/agent-eval/sdk-runner
# COPY sdk-runner.cjs /opt/agent-eval/sdk-runner/run.cjs
`

const buildargs = {
  BASE_IMAGE: DEFAULT_DOCKER_IMAGE,
  COPILOT_CLI_VERSION,
}
const reference = getImageReference({
  name: 'agent-eval/tools',
  dockerfile: DOCKERFILE,
  buildargs,
})
let image: ImageBuild | null = null

async function getToolsImageBuild(): Promise<ImageBuild> {
  if (image === null) {
    image = await buildImageFromDockerfile(DOCKERFILE, {
      buildargs,
      t: reference,
    })
  }

  return image
}

export {getToolsImageBuild}
