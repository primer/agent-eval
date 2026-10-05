import path from 'node:path'

const benchmarksDirectory = path.resolve(process.cwd(), '..', 'benchmarks')
const experimentsDirectory = path.resolve(process.cwd(), '..', 'experiments')
const scenariosDirectory = path.resolve(process.cwd(), '..', 'scenarios')

export {benchmarksDirectory, experimentsDirectory, scenariosDirectory}
