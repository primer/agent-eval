FROM node:24-slim

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=/home/node/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/sandbox/workspace /home/node/.npm-global /home/node/.copilot /home/node/.agents \
  && chown -R node:node /home/sandbox /home/node/.npm-global /home/node/.copilot /home/node/.agents

USER node

RUN npm config set prefix /home/node/.npm-global \
  && npm install -g @github/copilot \
  && touch /home/node/.copilot/mcp-config.json

WORKDIR /home/sandbox/workspace

CMD ["sleep", "infinity"]
