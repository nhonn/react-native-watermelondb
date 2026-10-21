import { appSchema, tableSchema } from '../Schema'
import {
  field,
  relation,
  immutableRelation,
  text,
  readonly,
  date,
} from '../decorators'
import Model from '../Model'
import type { Associations } from '../Model'
import Database from '../Database'
import SQLiteAdapter from '../adapters/sqlite'
export const testSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'mock_projects',
      columns: [
        {
          name: 'name',
          type: 'string',
        },
      ],
    }),
    tableSchema({
      name: 'mock_project_sections',
      columns: [
        {
          name: 'project_id',
          type: 'string',
        },
      ],
    }),
    tableSchema({
      name: 'mock_tasks',
      columns: [
        {
          name: 'name',
          type: 'string',
        },
        {
          name: 'position',
          type: 'number',
        },
        {
          name: 'is_completed',
          type: 'boolean',
        },
        {
          name: 'description',
          type: 'string',
          isOptional: true,
        },
        {
          name: 'project_id',
          type: 'string',
        },
        {
          name: 'project_section_id',
          type: 'string',
          isOptional: true,
        },
      ],
    }),
    tableSchema({
      name: 'mock_comments',
      columns: [
        {
          name: 'task_id',
          type: 'string',
        },
        {
          name: 'body',
          type: 'string',
        },
        {
          name: 'created_at',
          type: 'number',
        },
        {
          name: 'updated_at',
          type: 'number',
        },
      ],
    }),
  ],
})
export class MockProject extends Model {
  static table = 'mock_projects'
  static associations: Associations = {
    mock_tasks: {
      type: 'has_many',
      foreignKey: 'project_id',
    },
    mock_project_sections: {
      type: 'has_many',
      foreignKey: 'project_id',
    },
  }
  @field('name')
  name!: any
}
export class MockProjectSection extends Model {
  static table = 'mock_project_sections'
  static associations: Associations = {
    mock_projects: {
      type: 'belongs_to',
      key: 'project_id',
    },
    mock_tasks: {
      type: 'has_many',
      foreignKey: 'project_section_id',
    },
  }
  @field('project_id')
  projectId!: any
}
export class MockTask extends Model {
  static table = 'mock_tasks'
  static associations: Associations = {
    mock_projects: {
      type: 'belongs_to',
      key: 'project_id',
    },
    mock_project_sections: {
      type: 'belongs_to',
      key: 'project_section_id',
    },
    mock_comments: {
      type: 'has_many',
      foreignKey: 'task_id',
    },
  }
  @field('name')
  name!: any
  @field('position')
  position!: any
  @field('is_completed')
  isCompleted!: any
  @field('description')
  description!: any
  @field('project_id')
  projectId!: any
  @relation('mock_projects', 'project_id')
  project!: any
  @relation('mock_project_sections', 'project_section_id')
  projectSection!: any
}
export class MockComment extends Model {
  static table = 'mock_comments'
  static associations: Associations = {
    mock_tasks: {
      type: 'belongs_to',
      key: 'task_id',
    },
  }
  @immutableRelation('mock_tasks', 'task_id')
  task!: any
  @text('body')
  body!: any
  @readonly
  @date('created_at')
  createdAt!: any
  @readonly
  @date('updated_at')
  updatedAt!: any
}
export const modelClasses = [
  MockProject,
  MockProjectSection,
  MockTask,
  MockComment,
]
export const mockDatabase = ({
  schema = testSchema,
  migrations = undefined as any,
}: { schema?: any; migrations?: any } = {}) => {
  const adapter = new SQLiteAdapter({ schema, migrations })
  const database = new Database({
    adapter,
    modelClasses,
  })
  return {
    database,
    db: database,
    adapter,
    projects: database.get('mock_projects'),
    projectSections: database.get('mock_project_sections'),
    tasks: database.get('mock_tasks'),
    comments: database.get('mock_comments'),
    cloneDatabase: async (
      clonedSchema = schema // simulate reload
    ) =>
      new Database({
        adapter: await (database.adapter.underlyingAdapter as any).testClone({
          schema: clonedSchema,
        }),
        modelClasses,
      }),
  }
}