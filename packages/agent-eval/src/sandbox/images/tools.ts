import tarStream from 'tar-stream'
import {buildImage, getImageReference, type ImageBuild} from '../../docker'
import {DEFAULT_DOCKER_IMAGE} from '../constants'
import {getCopilotSdkRunnerScript} from '../../copilot-sdk'

const COPILOT_CLI_VERSION = '1.0.85'
const COPILOT_SDK_VERSION = '1.0.14'

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
COPY package.json /opt/agent-eval/sdk-runner/
RUN npm i --prefix /opt/agent-eval/sdk-runner
COPY sdk-runner.cjs /opt/agent-eval/sdk-runner/run.cjs
`

const buildargs = {
  BASE_IMAGE: DEFAULT_DOCKER_IMAGE,
  COPILOT_CLI_VERSION,
}
const files = {
  'package.json': JSON.stringify({
    dependencies: {
      '@github/copilot-sdk': COPILOT_SDK_VERSION,
    },
  }),
  'sdk-runner.cjs': getCopilotSdkRunnerScript(),
}

const reference = getImageReference({
  name: 'agent-eval/tools',
  dockerfile: DOCKERFILE,
  buildargs,
  files,
})
let image: ImageBuild | null = null

async function getToolsImageBuild(): Promise<ImageBuild> {
  if (image === null) {
    const context = tarStream.pack()
    context.entry({name: 'Dockerfile'}, DOCKERFILE)

    for (const [path, content] of Object.entries(files)) {
      context.entry({name: path}, content)
    }

    context.finalize()

    image = await buildImage(context, {
      buildargs,
      dockerfile: 'Dockerfile',
      t: reference,
    })
  }

  return image
}

export {getToolsImageBuild}
