import {createLocalSnapshot} from './snapshot'

export async function GET() {
  return Response.json(await createLocalSnapshot(), {headers: {'Cache-Control': 'no-store'}})
}
