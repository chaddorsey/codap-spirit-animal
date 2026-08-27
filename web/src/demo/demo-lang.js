/**
 * demo-lang.js — the DemoScript language: two surfaces over one format.
 *
 * - **Line notation** is the authoring surface. A curriculum author with no
 *   programming background writes a demo by hand; an LLM emits it cheaply.
 *   One step per line, errors reported with a line number.
 * - **Canonical JSON** is what the driver executes, and what an LLM may emit
 *   instead. `demo-script.schema.json` is the normative definition of it.
 *
 * There is no third surface. The first draft's JS builder verbs were cut in
 * review: a third representation is drift with no consumer.
 *
 * Externally authored scripts are UNTRUSTED INPUT. `validate()` runs against
 * the schema before Dot moves at all: unknown verbs, unknown target kinds and
 * over-long scripts are rejected with typed errors and zero motion.
 */
import SCHEMA from './demo-script.schema.json';

export class DemoSyntaxError extends Error {
  constructor(message, line, text) {
    super(`line ${line}: ${message}${text ? ` — "${text}"` : ''}`);
    this.name = 'DemoSyntaxError';
    this.line = line;
    this.text = text;
  }
}

export class DemoValidationError extends Error {
  constructor(message, path = '') {
    super(path ? `${path}: ${message}` : message);
    this.name = 'DemoValidationError';
    this.path = path;
  }
}

// --------------------------------------------------------------- validator
/**
 * A deliberately small JSON Schema subset interpreter — enough for
 * demo-script.schema.json and nothing more. The point is that the schema file
 * stays the single source of truth: adding a verb means editing the schema,
 * not this function and the schema.
 */
function check(value, schema, path, root) {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/')
      .reduce((o, k) => o?.[k], root);
    if (!target) throw new DemoValidationError(`bad $ref ${schema.$ref}`, path);
    return check(value, target, path, root);
  }
  if (schema.const !== undefined && value !== schema.const) {
    throw new DemoValidationError(`expected ${JSON.stringify(schema.const)}`, path);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new DemoValidationError(
      `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`, path);
  }
  if (schema.type) {
    const t = Array.isArray(value) ? 'array' : typeof value;
    const want = schema.type === 'number' ? 'number' : schema.type;
    const ok = want === 'array' ? Array.isArray(value)
      : want === 'object' ? (value && t === 'object')
      : t === want;
    if (!ok) throw new DemoValidationError(`must be ${schema.type}, got ${t}`, path);
  }
  if (schema.oneOf) {
    // Step forms are discriminated by `do`. Selecting the one candidate that
    // matches the verb FIRST means the author gets "pill:Nonsense does not
    // match ..." instead of "none of 15 forms matched", which is the
    // difference between a fixable error and a shrug.
    const verb = value?.do;
    if (verb !== undefined) {
      const byVerb = schema.oneOf.filter((s) => s.properties?.do?.const === verb);
      if (!byVerb.length) {
        const known = schema.oneOf.map((s) => s.properties?.do?.const).filter(Boolean);
        throw new DemoValidationError(
          `unknown verb "${verb}" (known: ${known.join(', ')})`, path);
      }
      if (byVerb.length === 1) return check(value, byVerb[0], path, root);
    }
    const errs = [];
    let matched = 0;
    for (const sub of schema.oneOf) {
      try { check(value, sub, path, root); matched += 1; }
      catch (err) { errs.push(err.message); }
    }
    if (matched !== 1) {
      throw new DemoValidationError(
        matched === 0
          ? `no form matches (${errs.slice(0, 2).join('; ')})`
          : `ambiguous (${matched} forms match)`, path);
    }
    return true;
  }
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      throw new DemoValidationError(
        `"${value}" does not match ${schema.pattern}`, path);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      throw new DemoValidationError(`longer than ${schema.maxLength} chars`, path);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) {
      throw new DemoValidationError(`must be >= ${schema.minimum}`, path);
    }
    if (schema.maximum != null && value > schema.maximum) {
      throw new DemoValidationError(`must be <= ${schema.maximum}`, path);
    }
  }
  if (Array.isArray(value)) {
    if (schema.maxItems != null && value.length > schema.maxItems) {
      throw new DemoValidationError(
        `${value.length} items exceeds the cap of ${schema.maxItems}`, path);
    }
    if (schema.minItems != null && value.length < schema.minItems) {
      throw new DemoValidationError(`needs at least ${schema.minItems} items`, path);
    }
    if (schema.items) {
      value.forEach((v, i) => check(v, schema.items, `${path}[${i}]`, root));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) throw new DemoValidationError(`missing "${key}"`, path);
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          throw new DemoValidationError(`unknown property "${key}"`, path);
        }
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) check(value[key], sub, path ? `${path}.${key}` : key, root);
    }
  }
  return true;
}

/** Throws DemoValidationError; returns the script unchanged when it passes. */
export function validate(script) {
  if (!script || typeof script !== 'object' || Array.isArray(script)) {
    throw new DemoValidationError('a script must be an object with demo + steps');
  }
  check(script, SCHEMA, '', SCHEMA);
  return script;
}

// ------------------------------------------------------------------ parser
/**
 * Verb table. `parse` turns a line into JSON; `line` turns that JSON back into
 * the canonical line. Both live here together so the round trip cannot drift.
 */
const VERBS = {
  say: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('say takes one emote (! ? ?!)', ln);
      return { do: 'say', emote: a[0] };
    },
    line: (s) => `say ${s.emote}`,
  },
  goto: {
    parse: (a, ln) => {
      if (a.length < 1 || a.length > 2) throw new DemoSyntaxError('goto <target> [side]', ln);
      return a[1] ? { do: 'goTo', target: a[0], beside: a[1] }
                  : { do: 'goTo', target: a[0] };
    },
    line: (s) => `goto ${s.target}${s.beside ? ` ${s.beside}` : ''}`,
  },
  peer: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('peer <target>', ln);
      return { do: 'peer', target: a[0] };
    },
    line: (s) => `peer ${s.target}`,
  },
  tap: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('tap <target>', ln);
      return { do: 'tap', target: a[0] };
    },
    line: (s) => `tap ${s.target}`,
  },
  openmenu: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('openmenu <target>', ln);
      return { do: 'openMenu', target: a[0] };
    },
    line: (s) => `openmenu ${s.target}`,
  },
  choose: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('choose <target>', ln);
      return { do: 'choose', target: a[0] };
    },
    line: (s) => `choose ${s.target}`,
  },
  drag: {
    parse: (a, ln) => {
      const arrow = a.indexOf('->');
      if (arrow !== 1 || a.length < 3 || a.length > 4) {
        throw new DemoSyntaxError('drag <src> -> <dst> [profile]', ln);
      }
      const step = { do: 'drag', from: a[0], to: a[2] };
      if (a[3]) step.profile = a[3];
      return step;
    },
    line: (s) => `drag ${s.from} -> ${s.to}${s.profile ? ` ${s.profile}` : ''}`,
  },
  marquee: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('marquee <target>', ln);
      return { do: 'marquee', target: a[0] };
    },
    line: (s) => `marquee ${s.target}`,
  },
  type: {
    parse: (a, ln) => {
      if (a.length < 2) throw new DemoSyntaxError('type <target> <text...>', ln);
      return { do: 'type', target: a[0], text: a.slice(1).join(' ') };
    },
    line: (s) => `type ${s.target} ${s.text}`,
  },
  carrycsv: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('carrycsv <dst>', ln);
      return { do: 'carryCsv', to: a[0] };
    },
    line: (s) => `carrycsv ${s.to}`,
  },
  wait: {
    parse: (a, ln) => {
      if (a.length !== 2 || !/^[0-9.]+s$/.test(a[1])) {
        throw new DemoSyntaxError('wait <condition> <seconds>s', ln);
      }
      return { do: 'waitFor', cond: a[0], timeoutSec: Number(a[1].slice(0, -1)) };
    },
    line: (s) => `wait ${s.cond} ${s.timeoutSec}s`,
  },
  beat: {
    parse: (a, ln) => {
      if (a.length !== 1 || Number.isNaN(Number(a[0]))) {
        throw new DemoSyntaxError('beat <seconds>', ln);
      }
      return { do: 'beat', sec: Number(a[0]) };
    },
    line: (s) => `beat ${s.sec}`,
  },
  revert: {
    parse: (a, ln) => {
      if (a.length) throw new DemoSyntaxError('revert takes no arguments', ln);
      return { do: 'revert' };
    },
    line: () => 'revert',
  },
  clearselection: {
    parse: (a, ln) => {
      if (a.length) throw new DemoSyntaxError('clearselection takes no arguments', ln);
      return { do: 'clearSelection' };
    },
    line: () => 'clearselection',
  },
  pose: {
    parse: (a, ln) => {
      if (a.length !== 1) throw new DemoSyntaxError('pose <clip>', ln);
      return { do: 'pose', clip: a[0] };
    },
    line: (s) => `pose ${s.clip}`,
  },
};

/** JSON `do` -> the line verb that renders it. The one place the two
 *  directions meet, and the reason the round trip is byte-stable. */
const DO_TO_VERB = {
  say: 'say', goTo: 'goto', peer: 'peer', tap: 'tap', openMenu: 'openmenu',
  choose: 'choose', drag: 'drag', marquee: 'marquee', type: 'type',
  carryCsv: 'carrycsv', waitFor: 'wait', beat: 'beat', revert: 'revert',
  clearSelection: 'clearselection', pose: 'pose',
};

/**
 * Parse a whole file. A file may hold several demos; blocks start at column 0
 * with `demo <Name>` and their steps are indented.
 *
 * @returns {Array<object>} canonical, validated scripts
 */
export function parse(text) {
  const lines = String(text).split('\n');
  const out = [];
  let current = null;
  lines.forEach((raw, i) => {
    const ln = i + 1;
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) return;                     // blank lines separate demos
    // `#` comments. Added because the alternative is worse: the reason a demo
    // is written a particular way — or deliberately ABSENT, as with tutorial 1's
    // Drag task — then has to live somewhere else, and the next person to read
    // the script does not find it. Comments are dropped by `toLines`, so a
    // parse/serialise round trip loses them; author them in the .demo file.
    if (line.trim().startsWith('#')) return;
    const indented = /^\s/.test(line);
    const tokens = line.trim().split(/\s+/);
    if (!indented) {
      if (tokens[0] !== 'demo') {
        throw new DemoSyntaxError('expected "demo <Name>" at column 0', ln, line.trim());
      }
      if (tokens.length !== 2) {
        throw new DemoSyntaxError('demo takes exactly one name', ln, line.trim());
      }
      current = { demo: tokens[1], steps: [] };
      out.push(current);
      return;
    }
    if (!current) throw new DemoSyntaxError('step before any "demo" line', ln, line.trim());
    const verb = VERBS[tokens[0].toLowerCase()];
    if (!verb) {
      throw new DemoSyntaxError(
        `unknown verb "${tokens[0]}" (known: ${Object.keys(VERBS).join(', ')})`,
        ln, line.trim());
    }
    current.steps.push(verb.parse(tokens.slice(1), ln));
  });
  if (!out.length) throw new DemoSyntaxError('no demos in this text', 1);
  for (const s of out) validate(s);
  return out;
}

/** Parse text that must contain exactly one demo. */
export function parseOne(text) {
  const all = parse(text);
  if (all.length !== 1) {
    throw new DemoSyntaxError(`expected exactly one demo, found ${all.length}`, 1);
  }
  return all[0];
}

/**
 * Render canonical line notation. `toLines(parse(text)) === text` for any file
 * written in canonical form — which every script in demo-scripts/ is, and
 * which the P2 round-trip test asserts byte for byte. (Comments and blank
 * lines inside a block are therefore not part of the canonical form.)
 */
export function toLines(scriptOrScripts) {
  const list = Array.isArray(scriptOrScripts) ? scriptOrScripts : [scriptOrScripts];
  return list.map((s) => {
    const body = s.steps.map((step) => {
      const verb = DO_TO_VERB[step.do];
      if (!verb) throw new DemoValidationError(`cannot render step "${step.do}"`);
      return `  ${VERBS[verb].line(step)}\n`;
    }).join('');
    return `demo ${s.demo}\n${body}`;
  }).join('\n');
}

/** Accepts either surface and returns validated canonical JSON. */
export function coerce(input) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed;
      try { parsed = JSON.parse(trimmed); }
      catch (err) { throw new DemoValidationError(`not valid JSON: ${err.message}`); }
      return Array.isArray(parsed) ? parsed.map(validate) : validate(parsed);
    }
    return parseOne(input);
  }
  return validate(input);
}

export { VERBS, DO_TO_VERB, SCHEMA };
