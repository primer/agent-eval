import {DefaultHost} from '../host'
import type {Host} from '../host'
import type {Sandbox} from '../sandbox'

type RunOptions = {
  host: Host
}

async function run({host = DefaultHost}: RunOptions) {
  //
}

type AttemptOptions = {
  host: Host
  sandbox: Sandbox
}

async function attempt({host = DefaultHost, sandbox}: AttemptOptions) {
  //
}

export {run, attempt}
