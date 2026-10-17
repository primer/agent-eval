FROM node:26.5.0-slim

RUN mkdir -p /home/sandbox/workspace
WORKDIR /home/sandbox/workspace

COPY . .
RUN npm pkg delete devDependencies.@primer/agent-eval \
  && npm install
