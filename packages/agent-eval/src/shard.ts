type Shard = {
  order: number
  total: number
}

function parseShard(value: string): Shard {
  const match = /^(\d+)\/(\d+)$/.exec(value)
  if (!match) {
    throw new Error('Shard must use the <order>/<total> format')
  }

  const order = Number.parseInt(match[1], 10)
  const total = Number.parseInt(match[2], 10)
  if (order < 1 || total < 1 || order > total) {
    throw new Error('Shard order must be between 1 and the total number of shards')
  }

  return {order, total}
}

function selectShard<T>(items: Array<T>, shard: Shard): Array<T> {
  return items.filter((_, index) => index % shard.total === shard.order - 1)
}

export {parseShard, selectShard}
export type {Shard}
