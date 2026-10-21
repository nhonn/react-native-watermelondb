import os from 'os'
import * as fork from '../../src'
import ForkSQLiteAdapter from '../../src/adapters/sqlite'

jest.mock('../../src/adapters/sqlite/makeDispatcher', () =>
  require('../node-sqlite/makeDispatcher')
)
jest.mock('@nozbe/watermelondb/adapters/sqlite/makeDispatcher', () =>
  require('./upstreamDispatcher')
)

const upstream: any = require('@nozbe/watermelondb')
const UpstreamSQLiteAdapter = require('@nozbe/watermelondb/adapters/sqlite').default

type Impl = { name: 'fork' | 'upstream'; lib: any; Adapter: any }
const impls: Impl[] = [
  { name: 'fork', lib: fork, Adapter: ForkSQLiteAdapter },
  { name: 'upstream', lib: upstream, Adapter: UpstreamSQLiteAdapter },
]

const N = 10_000
const RUNS = 5
const raw = (i: number): any => ({
  id: `t${String(i).padStart(6, '0')}`,
  name: `Task ${i}`,
  position: i,
  is_done: i % 2 === 0,
  project_id: `p${i % 100}`,
  notes: i % 3 ? null : 'lorem ipsum dolor sit amet',
})

const open = async (impl: Impl, dbName: string): Promise<any> => {
  const { appSchema, tableSchema, Model, Database } = impl.lib
  const schema = appSchema({
    version: 1,
    tables: [
      tableSchema({
        name: 'tasks',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'position', type: 'number' },
          { name: 'is_done', type: 'boolean' },
          { name: 'project_id', type: 'string', isIndexed: true },
          { name: 'notes', type: 'string', isOptional: true },
        ],
      }),
    ],
  })
  class Task extends Model {
    static table = 'tasks'
  }
  // both async (upstream's shim is async), so the comparison isolates the JS layer
  const adapter = new impl.Adapter({ dbName, schema, synchronous: false })
  const database = new Database({ adapter, modelClasses: [Task] })
  await (database.adapter as any).underlyingAdapter.initializingPromise
  return { database, tasks: database.get('tasks') }
}

const t = async (fn: () => Promise<void>): Promise<number> => {
  ; (globalThis as any).gc?.()
  const s = performance.now()
  await fn()
  return performance.now() - s
}

let runId = 0
const runOnce = async (impl: Impl): Promise<Record<string, number>> => {
  const { Q } = impl.lib
  const run = runId++
  const name = (slot: string): string =>
    `file:bench-${impl.name}-${run}-${slot}?mode=memory&cache=shared`
  const out: Record<string, number> = {}

  const A = await open(impl, name('seed'))
  out['insert 10k (1 batch)'] = await t(() =>
    A.database.write(() =>
      A.database.batch(
        ...Array.from({ length: N }, (_, i) => A.tasks.prepareCreateFromDirtyRaw(raw(i)))
      )
    )
  )

  const C = await open(impl, name('seed'))
  out['find cold x1000'] = await t(async () => {
    for (let i = 0; i < N; i += 10) {
      const r = await C.tasks.find(raw(i).id)
      expect(r.id).toBe(raw(i).id)
    }
  })

  const B = await open(impl, name('seed'))
  out['fetch 10k cold'] = await t(async () => {
    expect((await B.tasks.query().fetch()).length).toBe(N)
  })
  let records: any[] = []
  out['fetch 10k warm'] = await t(async () => {
    records = await B.tasks.query().fetch()
    expect(records.length).toBe(N)
  })
  out['filtered query x100'] = await t(async () => {
    for (let k = 0; k < 100; k++) {
      const r = await B.tasks
        .query(Q.where('project_id', `p${k}`), Q.sortBy('position', Q.desc))
        .fetch()
      expect(r.length).toBe(100)
    }
  })
  out['count x100'] = await t(async () => {
    let sum = 0
    for (let k = 0; k < 100; k++) {
      sum += await B.tasks
        .query(Q.where('project_id', `p${k}`), Q.where('is_done', true))
        .fetchCount()
    }
    expect(sum).toBe(5000)
  })
  out['update 10k (1 batch)'] = await t(() =>
    B.database.write(() =>
      B.database.batch(
        ...records.map((r) =>
          r.prepareUpdate(() => r._setRaw('position', r._raw.position + 1))
        )
      )
    )
  )
  out['delete 10k (1 batch)'] = await t(() =>
    B.database.write(() =>
      B.database.batch(...records.map((r) => r.prepareDestroyPermanently()))
    )
  )
  expect(await B.tasks.query().fetchCount()).toBe(0)

  const D = await open(impl, name('small'))
  out['200 small writes'] = await t(async () => {
    for (let i = 0; i < 200; i++) {
      await D.database.write(() =>
        D.database.batch(D.tasks.prepareCreateFromDirtyRaw(raw(i)))
      )
    }
  })
  return out
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

it('fork vs upstream', async () => {
  for (const impl of impls) await runOnce(impl) // warm-up, discarded
  const samples: Record<string, Record<string, number[]>> = { fork: {}, upstream: {} }
  for (let r = 0; r < RUNS; r++) {
    for (const impl of impls) {
      const res = await runOnce(impl)
      for (const [k, v] of Object.entries(res)) (samples[impl.name][k] ||= []).push(v)
    }
  }
  const verdict = (x: number): string =>
    x < 0.9 ? 'faster' : x <= 1.1 ? 'parity' : x <= 1.5 ? 'slower' : 'regression'
  const lines = [
    `node ${process.version}, ${os.cpus()[0].model}`,
    '',
    '| workload | fork ms | upstream ms | fork/upstream | verdict |',
    '|---|---|---|---|---|',
  ]
  for (const k of Object.keys(samples.fork)) {
    const f = median(samples.fork[k])
    const u = median(samples.upstream[k])
    lines.push(`| ${k} | ${f.toFixed(1)} | ${u.toFixed(1)} | ${(f / u).toFixed(2)} | ${verdict(f / u)} |`)
  }
  process.stdout.write(`\n${lines.join('\n')}\n`)
})
