import React from 'react'
import * as TestRenderer from 'react-test-renderer'
import useQuery from './useQuery'
import useCount from './useCount'
import useRecord from './useRecord'
import { mockDatabase } from '../__tests__/testModels'
import * as Q from '../QueryDescription'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('react hooks', () => {
  it('useQuery has data on first render and follows changes', async () => {
    const { db, tasks } = mockDatabase()
    const t1 = await db.write(() =>
      tasks.create((t: any) => {
        t.isCompleted = true
      })
    )
    const renders: any[][] = []
    const Component = () => {
      renders.push(useQuery(tasks.query(Q.where('is_completed', true))))
      return null
    }
    await TestRenderer.act(async () => {
      TestRenderer.create(<Component />)
    })
    expect(renders[0]).toEqual([t1])
    const t2 = await TestRenderer.act(() =>
      db.write(() =>
        tasks.create((t: any) => {
          t.isCompleted = true
        })
      )
    )
    await TestRenderer.act(async () => {
      await sleep(10)
    })
    expect(renders[renders.length - 1]).toEqual([t1, t2])
  })
  it('useCount follows changes', async () => {
    const { db, tasks } = mockDatabase()
    await db.write(() =>
      tasks.create((t: any) => {
        t.isCompleted = true
      })
    )
    const counts: number[] = []
    const Component = () => {
      counts.push(useCount(tasks.query(Q.where('is_completed', true))))
      return null
    }
    await TestRenderer.act(async () => {
      TestRenderer.create(<Component />)
    })
    expect(counts[0]).toBe(1)
    await TestRenderer.act(async () => {
      await db.write(() =>
        tasks.create((t: any) => {
          t.isCompleted = true
        })
      )
      await sleep(300)
    })
    expect(counts[counts.length - 1]).toBe(2)
  })
  it('useRecord re-renders when the record changes', async () => {
    const { db, tasks } = mockDatabase()
    const t1 = await db.write(() =>
      tasks.create((t: any) => {
        t.name = 'a'
      })
    )
    const names: string[] = []
    const Component = () => {
      names.push((useRecord(t1) as any).name)
      return null
    }
    await TestRenderer.act(async () => {
      TestRenderer.create(<Component />)
    })
    const before = names.length
    await TestRenderer.act(async () => {
      await db.write(() =>
        t1.update((t: any) => {
          t.name = 'b'
        })
      )
    })
    expect(names.length).toBe(before + 1)
    expect(names[names.length - 1]).toBe('b')
  })
})
