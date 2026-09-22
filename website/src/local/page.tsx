import {LocalResults} from '../local/LocalResults'
import {createLocalSnapshot} from '../local/snapshot'

export default async function Page() {
  return (
    <LocalResults
      initial={await createLocalSnapshot()}
      live={process.env.AGENT_EVAL_UI_MODE === 'dev'}
      dataUrl={`${process.env.PAGES_BASE_PATH ?? ''}/local-data.json`}
    />
  )
}
