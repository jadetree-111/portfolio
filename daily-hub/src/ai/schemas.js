// JSON Schemas for structured outputs (output_config.format).
// Constraints follow the API's supported subset: every object is closed
// (additionalProperties: false) and lists all keys as required; no min/max/length rules.
const str = { type: 'string' };
const int = { type: 'integer' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const closed = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TASKS_SCHEMA = closed({
  tasks: {
    type: 'array',
    items: closed({
      title: str,
      details: str,
      kind: { type: 'string', enum: ['todo', 'event', 'deadline'] },
      date: nullable(str),
      time: nullable(str),
      end_time: nullable(str),
      location: str,
      priority: { type: 'string', enum: ['normal', 'high'] },
      tags: { type: 'array', items: str },
      source_text: str,
    }),
  },
  notes: str,
});

const weekRange = closed({
  from: int,
  to: int,
  parity: { type: 'string', enum: ['all', 'odd', 'even'] },
});

export const TIMETABLE_SCHEMA = closed({
  courses: {
    type: 'array',
    items: closed({
      name: str,
      teacher: str,
      location: str,
      weekday: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
      start_period: nullable(int),
      end_period: nullable(int),
      start_time: nullable(str),
      end_time: nullable(str),
      week_ranges: { type: 'array', items: weekRange },
    }),
  },
  periods: { type: 'array', items: closed({ n: int, start: str, end: str }) },
  warnings: { type: 'array', items: str },
});
