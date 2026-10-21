import Model from '../../Model'
import { tableSchema } from '../../Schema'
import json from './index'
import field from '../field'
const schema = tableSchema({
  name: 'mock',
  columns: [
    {
      name: 'extras',
      type: 'string',
      isOptional: true,
    },
  ],
})
const schema2 = tableSchema({
  name: 'mock',
  columns: [
    {
      name: 'kind',
      type: 'string',
    },
    {
      name: 'extras',
      type: 'string',
      isOptional: true,
    },
  ],
})

const mockSanitizer = (storedValue: any) =>
  storedValue && Array.isArray(storedValue.elements)
    ? {
        elements: storedValue.elements,
      }
    : {
        elements: [],
      }

const mockSanitizer2 = (storedValue: any, model: any) =>
  model.kind === 'A'
    ? {
        dataA: storedValue.dataA,
      }
    : {
        dataB: storedValue.dataB,
      }

class MockModel extends Model {
  static table = 'mock'
  @json('extras', mockSanitizer)
  extras!: any
}

class MockModel2 extends Model {
  static table = 'mock'
  @json('extras', () => null)
  extras!: any
}

class MockModel3 extends Model {
  static table = 'mock'
  @field('kind')
  kind!: any
  @json('extras', mockSanitizer2)
  extras!: any
  @json('extras', mockSanitizer2, {
    memo: true,
  })
  extrasMemoized!: any
}

describe('decorators/json', () => {
  it('deserializes value from JSON', () => {
    const model = new MockModel(
      {
        schema,
      } as any,
      {
        extras: '{"elements":[10,false,"foo",{"foo":"bar"}]}',
      } as any
    )
    expect(model.extras).toEqual({
      elements: [
        10,
        false,
        'foo',
        {
          foo: 'bar',
        },
      ],
    })
    const model2 = new MockModel(
      {
        schema,
      } as any,
      {
        extras: '-Infinity',
      } as any
    )
    expect(model2.extras).toEqual({
      elements: [],
    })
    const model3 = new MockModel(
      {
        schema,
      } as any,
      {
        extras: null,
      } as any
    )
    expect(model3.extras).toEqual({
      elements: [],
    })
    const model4 = new MockModel2(
      {
        schema,
      } as any,
      {
        extras: {
          data: [1, 2, 3, 4],
        },
      } as any
    )
    expect(model4.extras).toEqual(null)
    const model5 = new MockModel3(
      {
        // @ts-expect-error ported Flow test code is not type-safe here
        schema2,
      },
      {
        kind: 'A',
        extras: '{ "dataA": [1, 2, 3, 4] }',
      }
    )
    expect(model5.extras).toEqual({
      dataA: [1, 2, 3, 4],
    })
    const model6 = new MockModel3(
      {
        // @ts-expect-error ported Flow test code is not type-safe here
        schema2,
      },
      {
        kind: 'B',
        extras: '{ "dataB": [1, 2, 3, 4] }',
      }
    )
    expect(model6.extras).toEqual({
      dataB: [1, 2, 3, 4],
    })
  })
  it('serializes value to JSON', () => {
    const model = new MockModel(
      {
        schema,
      } as any,
      {} as any
    )
    model._isEditing = true
    model.extras = {
      elements: [
        true,
        3.14,
        {
          bar: 'baz',
        },
      ],
      otherValue: true,
    }
    expect(model._getRaw('extras')).toBe(
      '{"elements":[true,3.14,{"bar":"baz"}]}'
    )
    model.extras = null
    expect(model._getRaw('extras')).toBe('{"elements":[]}')
    const model2 = new MockModel2(
      {
        schema,
      } as any,
      {} as any
    )
    model2._isEditing = true
    model2.extras = {
      data: [1, 2, 3, 4],
    }
    expect(model2._getRaw('extras')).toBe(null)
  })
  it(`can memoize deserialized values`, () => {
    const model = new MockModel3(
      {
        // @ts-expect-error ported Flow test code is not type-safe here
        schema2,
      },
      {
        kind: 'B',
        extras: '{ "dataB": [1, 2, 3, 4] }',
      }
    )
    const extras = model.extrasMemoized
    expect(extras).toEqual(model.extras)
    expect(extras).not.toBe(model.extras)
    expect(extras).toBe(model.extrasMemoized)
  }) // FIXME: missing test?
  // eslint-disable-next-line jest/no-commented-out-tests
  // it('fails if applied to incorrect fields', () => {
  //   expect(
  //     () =>
  //       class {
  //         @json
  //         noName
  //       },
  //   ).toThrow('column name')
  // })
})
