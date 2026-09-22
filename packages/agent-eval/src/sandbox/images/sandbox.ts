import {getImageReference, buildImageFromDockerfile, type ImageBuild} from '../../docker'
import {getToolsImageBuild} from './tools'

const DOCKERFILE = `ARG BASE_IMAGE
ARG TOOLS_IMAGE

FROM \${TOOLS_IMAGE} AS tools
FROM \${BASE_IMAGE} AS base

COPY --from=tools /opt/agent-eval /opt/agent-eval

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates chromium git \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p \\
    /home/sandbox/workspace \\
    /home/node/.copilot/agents \\
    /home/node/.agents/skills \\
  && chown -R node:node \\
    /home/sandbox \\
    /home/node/.copilot \\
    /home/node/.agents

USER node

RUN mkdir -p /home/node/.npm-global \
  && npm config set prefix /home/node/.npm-global

RUN printf '%s\\n' '{"mcpServers":{}}' > /home/node/.copilot/mcp-config.json

ENV PATH="/home/node/.npm-global/bin:\${PATH}"

FROM base AS sandbox

WORKDIR /home/sandbox/workspace

CMD ["sleep", "infinity"]
`

type GetSandboxImageBuildOptions = {
  baseImage: string
}

const images: Map<string, ImageBuild> = new Map()

async function getSandboxImageBuild({baseImage}: GetSandboxImageBuildOptions): Promise<ImageBuild> {
  const toolsImage = await getToolsImageBuild()
  const buildargs = {
    BASE_IMAGE: baseImage,
    TOOLS_IMAGE: toolsImage.tagName,
  }
  const reference = getImageReference({
    name: 'agent-eval/sandbox',
    dockerfile: DOCKERFILE,
    buildargs,
  })

  if (images.has(reference)) {
    return images.get(reference)!
  }

  const image = await buildImageFromDockerfile(DOCKERFILE, {
    buildargs,
    t: reference,
  })

  images.set(reference, image)

  return image
}

export {getSandboxImageBuild}
