import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS_SCHEMA, TIMETABLE_SCHEMA } from '../src/ai/schemas.js';
import { TASKS_SYSTEM, TIMETABLE_SYSTEM } from '../src/ai/prompts.js';

function propertyNames(schema, out = new Set()) {
  if (!schema || typeof schema !== 'object') return out;
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    out.add(key);
    propertyNames(value, out);
  }
  propertyNames(schema.items, out);
  (schema.anyOf ?? []).forEach((alt) => propertyNames(alt, out));
  return out;
}

// A relay may accept output_config.format without enforcing it, and then the prompt alone decides
// the key names. Seen live: the model wrote {"period","start_time","end_time"} for a table whose
// schema said {"n","start","end"}, because the prompt never named those keys.
for (const [label, schema, system] of [['tasks', TASKS_SCHEMA, TASKS_SYSTEM], ['timetable', TIMETABLE_SCHEMA, TIMETABLE_SYSTEM]]) {
  test(`${label}: every key in the response schema is spelled out, quoted, in the system prompt`, () => {
    const names = [...propertyNames(schema)];
    assert.ok(names.length > 8, 'the walk found the schema keys');
    const missing = names.filter((name) => !system.includes(`"${name}"`));
    assert.deepEqual(missing, []);
  });

  test(`${label}: the format example in the prompt is valid JSON that satisfies the schema's required keys`, () => {
    const example = system.trimEnd().split('\n').at(-1); // the example is the prompt's last line
    const parsed = JSON.parse(example);
    assert.deepEqual(Object.keys(parsed).sort(), [...schema.required].sort());
  });
}
