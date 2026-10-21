// eslint-disable-next-line
import { TestScheduler } from 'rxjs/testing'

class WatermelonTestScheduler extends TestScheduler {
  cold(marbles: any, values: any, error: any) {
    return this.createColdObservable(marbles, values, error)
  }

  hot(marbles: any, values: any, error: any) {
    return this.createHotObservable(marbles, values, error)
  }
}

export default function makeScheduler() {
  return new WatermelonTestScheduler((actual, expected) => {
    expect(actual).toEqual(expected)
  })
}
