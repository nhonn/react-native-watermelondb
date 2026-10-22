/* eslint-disable prefer-template */
import Query from '../../../Query'
import Model from '../../../Model'
import * as Q from '../../../QueryDescription'
import encodeQuery from './index' // TODO: Standardize these mocks (same as in sqlite encodeQuery, query test)

class MockTask extends Model {
  static table = 'tasks'
  static associations: any = {
    projects: {
      type: 'belongs_to',
      key: 'project_id',
    },
    tag_assignments: {
      type: 'has_many',
      foreignKey: 'task_id',
    },
  }
}

class MockProject extends Model {
  static table = 'projects'
  static associations: any = {
    teams: {
      type: 'belongs_to',
      key: 'team_id',
    },
  }
}

const mockCollection = Object.freeze({
  modelClass: MockTask,
  db: {
    get: (table: any) =>
      table === 'projects'
        ? {
            modelClass: MockProject,
          }
        : {},
  },
})

const encodedWithArgs = (clauses: any, countMode?: any) =>
  encodeQuery(new Query(mockCollection as any, clauses), countMode)

const encoded = (clauses: any, countMode?: any) => {
  const [sql] = encodedWithArgs(clauses, countMode)
  return sql
}

describe('SQLite encodeQuery', () => {
  it('encodes simple queries', () => {
    expect(encodedWithArgs([])).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ?`,
      ['deleted'],
    ])
  })
  it('encodes multiple conditions and value types', () => {
    expect(
      encodedWithArgs([
        Q.where('col1', `value "'with'" quotes`),
        Q.where('col2', 2),
        Q.where('col3', true),
        Q.where('col4', false),
        Q.where('col5', null),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."col1" is ?` +
        ` and "tasks"."col2" is ?` +
        ` and "tasks"."col3" is ?` +
        ` and "tasks"."col4" is ?` +
        ` and "tasks"."col5" is ?` +
        ` and "tasks"."_status" is not ?`,
      [`value "'with'" quotes`, 2, true, false, null, 'deleted'],
    ])
  })
  it('produces identical SQL for different values', () => {
    const [sqlA, argsA] = encodedWithArgs([Q.where('project_id', 'a')])
    const [sqlB, argsB] = encodedWithArgs([Q.where('project_id', 'b')])
    expect(sqlA).toBe(sqlB)
    expect(argsA).toEqual(['a', 'deleted'])
    expect(argsB).toEqual(['b', 'deleted'])
  })
  it('encodes multiple operators', () => {
    expect(
      encodedWithArgs([
        Q.where('col1', Q.eq('val1')),
        Q.where('col2', Q.gt(2)),
        Q.where('col3', Q.gte(3)),
        Q.where('col3_5', Q.weakGt(3.5)),
        Q.where('col4', Q.lt(4)),
        Q.where('col5', Q.lte(5)),
        Q.where('col6', Q.notEq(null)),
        Q.where('col7', Q.oneOf([1, 2, 3])),
        Q.where('col8', Q.notIn(['"a"', "'b'", 'c'])),
        Q.where('col9', Q.between(10, 11)),
        Q.where('col10', Q.like('%abc')),
        Q.where('col11', Q.notLike('def%')),
        Q.where('col12', Q.includes('foo')),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."col1" is ?` +
        ` and "tasks"."col2" > ?` +
        ` and "tasks"."col3" >= ?` +
        ` and "tasks"."col3_5" > ?` +
        ` and "tasks"."col4" < ?` +
        ` and "tasks"."col5" <= ?` +
        ` and "tasks"."col6" is not ?` +
        ` and "tasks"."col7" in (?, ?, ?)` +
        ` and "tasks"."col8" not in (?, ?, ?)` +
        ` and "tasks"."col9" between ? and ?` +
        ` and "tasks"."col10" like ?` +
        ` and "tasks"."col11" not like ?` +
        ` and instr("tasks"."col12", ?)` +
        ` and "tasks"."_status" is not ?`,
      [
        'val1',
        2,
        3,
        3.5,
        4,
        5,
        null,
        1,
        2,
        3,
        '"a"',
        "'b'",
        'c',
        10,
        11,
        '%abc',
        'def%',
        'foo',
        'deleted',
      ],
    ])
  })
  it('inlines long oneOf lists', () => {
    const values = Array.from({ length: 101 }, (_, i) => i)
    const [sql, args] = encodedWithArgs([
      Q.where('col1', 'x'),
      Q.where('col2', Q.oneOf(values)),
    ])
    expect(sql).toBe(
      `select "tasks".* from "tasks" where "tasks"."col1" is ?` +
        ` and "tasks"."col2" in (${values.join(', ')})` +
        ` and "tasks"."_status" is not ?`
    )
    expect(args).toEqual(['x', 'deleted'])
  })
  it('encodes column comparisons', () => {
    expect(
      encodedWithArgs([
        Q.where('left1', Q.gte(Q.column('right1'))),
        Q.where('left2', Q.weakGt(Q.column('right2'))), // Q.where('left3', Q.includes(Q.column('right3'))),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."left1" >= "tasks"."right1"` +
        ` and ("tasks"."left2" > "tasks"."right2" or ("tasks"."left2" is not ? and "tasks"."right2" is ?))` + // ` and instr("tasks"."left3", "tasks"."right3")` +
        ` and "tasks"."_status" is not ?`,
      [null, null, 'deleted'],
    ])
  })
  it(`encodes raw SQL expressions`, () => {
    expect(
      encodedWithArgs([Q.unsafeSqlExpr('tasks.left1 >= projects.right1')])
    ).toEqual([
      `select "tasks".* from "tasks" where tasks.left1 >= projects.right1 and "tasks"."_status" is not ?`,
      ['deleted'],
    ])
  })
  it('encodes AND/OR nesting', () => {
    expect(
      encodedWithArgs([
        Q.where('col1', 'value'),
        Q.or(
          Q.where('col2', true),
          Q.where('col3', null),
          Q.and(Q.where('col4', Q.gt(5)), Q.where('col5', Q.notIn([6, 7])))
        ),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."col1" is ?` +
        ` and ("tasks"."col2" is ? or "tasks"."col3" is ?` +
        ` or ("tasks"."col4" > ?` +
        ` and "tasks"."col5" not in (?, ?)))` +
        ` and "tasks"."_status" is not ?`,
      ['value', true, null, 5, 6, 7, 'deleted'],
    ])
  })
  it('encodes count queries', () => {
    expect(encodedWithArgs([Q.where('col1', 'value')], true)).toEqual([
      `select count(*) as "count" from "tasks" where "tasks"."col1" is ? and "tasks"."_status" is not ?`,
      ['value', 'deleted'],
    ])
  })
  it('encodes JOIN queries', () => {
    const query = [
      Q.on('projects', 'team_id', 'abcdef'),
      Q.on('projects', 'is_active', true),
      Q.where('left_column', 'right_value'),
      Q.on('tag_assignments', 'tag_id', Q.oneOf(['a', 'b', 'c'])),
    ]
    const expectedQuery =
      `join "projects" on "projects"."id" = "tasks"."project_id"` +
      ` join "tag_assignments" on "tag_assignments"."task_id" = "tasks"."id"` +
      ` where ("projects"."team_id" is ?` +
      ` and "projects"."_status" is not ?)` +
      ` and ("projects"."is_active" is ?` +
      ` and "projects"."_status" is not ?)` +
      ` and "tasks"."left_column" is ?` +
      ` and ("tag_assignments"."tag_id" in (?, ?, ?)` +
      ` and "tag_assignments"."_status" is not ?)` +
      ` and "tasks"."_status" is not ?`
    const args = [
      'abcdef',
      'deleted',
      true,
      'deleted',
      'right_value',
      'a',
      'b',
      'c',
      'deleted',
      'deleted',
    ]
    expect(encodedWithArgs(query)).toEqual([
      `select distinct "tasks".* from "tasks" ${expectedQuery}`,
      args,
    ])
    expect(encodedWithArgs(query, true)).toEqual([
      `select count(distinct "tasks"."id") as "count" from "tasks" ${expectedQuery}`,
      args,
    ])
  })
  it('encodes column comparisons on JOIN queries', () => {
    expect(
      encodedWithArgs([
        Q.on('projects', 'left_column', Q.lte(Q.column('right_column'))),
        Q.on('projects', 'left2', Q.weakGt(Q.column('right2'))),
      ])
    ).toEqual([
      `select "tasks".* from "tasks"` +
        ` join "projects" on "projects"."id" = "tasks"."project_id"` +
        ` where ("projects"."left_column" <= "projects"."right_column"` +
        ` and "projects"."_status" is not ?)` +
        ` and (("projects"."left2" > "projects"."right2"` +
        ` or ("projects"."left2" is not ?` +
        ` and "projects"."right2" is ?))` +
        ` and "projects"."_status" is not ?)` +
        ` and "tasks"."_status" is not ?`,
      ['deleted', null, null, 'deleted', 'deleted'],
    ])
  })
  it(`encodes on nested in and/or`, () => {
    expect(
      encodedWithArgs([
        Q.experimentalJoinTables(['projects', 'tag_assignments']),
        Q.or(
          Q.where('is_followed', true),
          Q.on('projects', 'is_followed', true),
          Q.and(Q.on('tag_assignments', 'foo', 'bar'))
        ),
      ])
    ).toEqual([
      `select distinct "tasks".* from "tasks"` +
        ` left join "projects" on "projects"."id" = "tasks"."project_id"` +
        ` left join "tag_assignments" on "tag_assignments"."task_id" = "tasks"."id"` +
        ` where ("tasks"."is_followed" is ?` +
        ` or ("projects"."is_followed" is ? and "projects"."_status" is not ?)` +
        ` or (("tag_assignments"."foo" is ? and "tag_assignments"."_status" is not ?)))` +
        ` and "tasks"."_status" is not ?`,
      [true, true, 'deleted', 'bar', 'deleted', 'deleted'],
    ])
  })
  it(`encodes Q.on nested inside Q.on`, () => {
    expect(
      encodedWithArgs([
        Q.experimentalNestedJoin('projects', 'teams'),
        Q.on('projects', Q.on('teams', 'foo', 'bar')),
      ])
    ).toEqual([
      `select "tasks".* from "tasks"` +
        ` join "projects" on "projects"."id" = "tasks"."project_id"` +
        ` left join "teams" on "teams"."id" = "projects"."team_id"` +
        ` where (("teams"."foo" is ?` +
        ` and "teams"."_status" is not ?)` +
        ` and "projects"."_status" is not ?)` +
        ` and "tasks"."_status" is not ?`,
      ['bar', 'deleted', 'deleted', 'deleted'],
    ])
  })
  it(`encodes multiple conditions on Q.on`, () => {
    expect(
      encodedWithArgs([
        Q.on('projects', [
          Q.where('foo', 'bar'),
          Q.or(Q.where('bar', 'baz'), Q.where('bla', 'boop')),
        ]),
      ])
    ).toEqual([
      `select "tasks".* from "tasks"` +
        ` join "projects" on "projects"."id" = "tasks"."project_id"` +
        ` where ("projects"."foo" is ?` +
        ` and ("projects"."bar" is ?` +
        ` or "projects"."bla" is ?)` +
        ` and "projects"."_status" is not ?)` +
        ` and "tasks"."_status" is not ?`,
      ['bar', 'baz', 'boop', 'deleted', 'deleted'],
    ])
  })
  it('fails to encode bad oneOf/notIn values', () => {
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(() => encoded([Q.where('col7', Q.oneOf([{}]))])).toThrow(
      'Invalid value to encode into query'
    )
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(() => encoded([Q.where('col7', Q.notIn([{}]))])).toThrow(
      'Invalid value to encode into query'
    )
  })
  it(`fails to encode nested on without explicit joinTables`, () => {
    expect(() =>
      encoded([Q.or(Q.on('projects', 'is_followed', true))])
    ).toThrow('explicitly declare Q.experimentalJoinTables')
  })
  it('encodes order by clause', () => {
    expect(encodedWithArgs([Q.sortBy('sortable_column', Q.desc)])).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ? order by "tasks"."sortable_column" desc`,
      ['deleted'],
    ])
  })
  it('encodes multiple order by clauses', () => {
    expect(
      encodedWithArgs([
        Q.sortBy('sortable_column', Q.desc),
        Q.sortBy('sortable_column2', Q.asc),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ? order by "tasks"."sortable_column" desc, "tasks"."sortable_column2" asc`,
      ['deleted'],
    ])
  })
  it('encodes limit clause', () => {
    expect(encodedWithArgs([Q.take(100)])).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ? limit ?`,
      ['deleted', 100],
    ])
  })
  it('encodes limit with offset clause', () => {
    expect(encodedWithArgs([Q.take(100), Q.skip(200)])).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ? limit ? offset ?`,
      ['deleted', 100, 200],
    ])
  })
  it('encodes order by together with limit and offset clause', () => {
    expect(
      encodedWithArgs([
        Q.sortBy('sortable_column', 'desc'),
        Q.take(100),
        Q.skip(200),
      ])
    ).toEqual([
      `select "tasks".* from "tasks" where "tasks"."_status" is not ? order by "tasks"."sortable_column" desc limit ? offset ?`,
      ['deleted', 100, 200],
    ])
  })
  it(`encodes unsafe SQL queries`, () => {
    expect(
      encoded([Q.unsafeSqlQuery(`select * from tasks where foo = 'bar'`)])
    ).toBe(`select * from tasks where foo = 'bar'`)
    expect(
      encoded(
        [
          Q.unsafeSqlQuery(
            `select count(*) as count from tasks where foo = 'bar'`
          ),
        ],
        true
      )
    ).toBe(`select count(*) as count from tasks where foo = 'bar'`)
    expect(
      encodedWithArgs([
        Q.unsafeSqlQuery(
          `select * from tasks where text1 is ? and num1 is ? and bool1 is ?`,
          ['foo', 10, true]
        ),
      ])
    ).toEqual([
      `select * from tasks where text1 is ? and num1 is ? and bool1 is ?`,
      ['foo', 10, true],
    ])
  })
})
