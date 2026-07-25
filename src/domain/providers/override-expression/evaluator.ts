import type { JsonObject, JsonValue } from '../../json.ts'
import { isJsonValue } from '../../json.ts'
import { MihomoPattern } from '../mihomo-pattern.ts'

type PathSegment =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }

type ValueReference = {
  parent: JsonObject | JsonValue[] | undefined
  key: string | number | undefined
  value: JsonValue
}

export function applyOverrideExpressions(input: JsonObject, expressions: readonly string[]): JsonObject {
  let output = structuredClone(input)
  for (const [index, source] of expressions.entries()) {
    try {
      output = applyOverrideExpression(output, source)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid override expression'
      throw new Error(`overrideExpr[${index}] ${JSON.stringify(source)}: ${message}`)
    }
  }
  return output
}

export function applyOverrideExpression(input: JsonObject, source: string): JsonObject {
  const uncommented = stripComment(source).trim()
  if (!uncommented) throw new Error('expression is empty')
  const output = structuredClone(input)
  for (const statement of splitTopLevel(uncommented, '|', true)) applyStatement(output, statement.trim())
  return output
}

function applyStatement(root: JsonObject, statement: string): void {
  const deletion = /^del\s*\((.*)\)$/s.exec(statement)
  if (deletion) {
    for (const pathSource of splitTopLevel(deletion[1] ?? '', ',')) {
      const path = parsePath(pathSource.trim())
      if (path.length === 0) throw new Error('del(.) cannot delete the root mapping')
      deleteReferences(resolveReferences(root, path, false))
    }
    return
  }

  const assignment = findAssignment(statement)
  if (!assignment) throw new Error('only update expressions that produce one mapping are supported')
  const path = parsePath(assignment.path)
  if (path.length === 0) throw new Error('assigning the root mapping is not supported')
  const references = resolveReferences(root, path, assignment.operator === '=')
  for (const reference of references) {
    const context = assignment.operator === '=' ? root : reference.value
    const value = evaluate(assignment.expression, context)
    if (reference.parent === undefined || reference.key === undefined) continue
    const next = compoundValue(assignment.operator, reference.value, value)
    if (Array.isArray(reference.parent) && typeof reference.key === 'number') reference.parent[reference.key] = next
    else if (!Array.isArray(reference.parent) && typeof reference.key === 'string') reference.parent[reference.key] = next
  }
}

function findAssignment(source: string): { path: string; operator: string; expression: string } | undefined {
  const operators = ['|=', '+=', '-=', '*=', '=']
  let quote = false
  let escaped = false
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') { quote = true; continue }
    if ('([{'.includes(character ?? '')) { depth += 1; continue }
    if (')]}'.includes(character ?? '')) { depth -= 1; continue }
    if (depth !== 0) continue
    const operator = operators.find((candidate) => source.startsWith(candidate, index))
    if (!operator) continue
    const path = source.slice(0, index).trim()
    if (!path.startsWith('.')) continue
    return { path, operator, expression: source.slice(index + operator.length).trim() }
  }
  return undefined
}

function evaluate(source: string, input: JsonValue): JsonValue {
  const expression = unwrapParentheses(source.trim())
  if (!expression) throw new Error('assignment value is empty')

  const pipeline = splitTopLevel(expression, '|', true)
  if (pipeline.length > 1) {
    let value = input
    for (const stage of pipeline) value = evaluate(stage, value)
    return value
  }

  for (const operator of ['//', ' or ', ' and ', '==', '!=', '<=', '>=', '<', '>']) {
    const parts = splitBinary(expression, operator)
    if (parts) return evaluateBinary(operator.trim(), evaluate(parts[0], input), evaluate(parts[1], input))
  }
  for (const operators of [['+', '-'], ['*', '/', '%']]) {
    const parts = splitArithmetic(expression, operators)
    if (parts) return evaluateBinary(parts.operator, evaluate(parts.left, input), evaluate(parts.right, input))
  }

  if (expression.startsWith('.')) {
    const values = resolveReferences(input, parsePath(expression), false).map((reference) => reference.value)
    return values[0] ?? null
  }
  if (expression.startsWith('[') && expression.endsWith(']')) {
    const content = expression.slice(1, -1).trim()
    return content ? splitTopLevel(content, ',').map((item) => evaluate(item, input)) : []
  }
  if (expression.startsWith('{') && expression.endsWith('}')) {
    const output: JsonObject = {}
    const content = expression.slice(1, -1).trim()
    for (const item of content ? splitTopLevel(content, ',') : []) {
      const separator = findTopLevelCharacter(item, ':')
      if (separator < 0) throw new Error('mapping entry requires a colon')
      const keySource = item.slice(0, separator).trim()
      const key = keySource.startsWith('"') ? parseString(keySource) : keySource
      output[key] = evaluate(item.slice(separator + 1), input)
    }
    return output
  }
  if (expression.startsWith('"')) return parseString(expression)
  if (expression === 'true') return true
  if (expression === 'false') return false
  if (expression === 'null' || expression === '~') return null
  if (/^-?0x[\da-f]+$/i.test(expression)) return Number.parseInt(expression.replace(/^-?0x/i, ''), 16) * (expression.startsWith('-') ? -1 : 1)
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(expression)) return Number(expression)

  const call = /^([A-Za-z_][\w-]*)\s*(?:\((.*)\))?$/s.exec(expression)
  if (call) return evaluateFunction(call[1] ?? '', call[2], input)
  throw new Error(`unsupported value expression: ${expression}`)
}

function evaluateFunction(name: string, argumentSource: string | undefined, input: JsonValue): JsonValue {
  const args = argumentSource === undefined || argumentSource.trim() === ''
    ? []
    : splitTopLevel(argumentSource, ',').map((argument) => evaluate(argument, input))
  const stringInput = (): string => {
    if (typeof input !== 'string') throw new Error(`${name} requires string input`)
    return input
  }
  switch (name) {
    case 'upcase': requireArgs(name, args, 0); return stringInput().toUpperCase()
    case 'downcase': requireArgs(name, args, 0); return stringInput().toLowerCase()
    case 'trim': requireArgs(name, args, 0); return stringInput().trim()
    case 'length':
      requireArgs(name, args, 0)
      if (input === null) return 0
      if (typeof input === 'string') return Buffer.byteLength(input)
      if (Array.isArray(input)) return input.length
      if (typeof input === 'object') return Object.keys(input).length
      return String(input).length
    case 'not': requireArgs(name, args, 0); return !truthy(input)
    case 'tostring':
      requireArgs(name, args, 0)
      return typeof input === 'string' ? input : JSON.stringify(input)
    case 'tonumber': {
      requireArgs(name, args, 0)
      if (typeof input === 'number') return input
      if (typeof input !== 'string' || !Number.isFinite(Number(input))) throw new Error('tonumber requires a numeric value')
      return Number(input)
    }
    case 'split': {
      requireArgs(name, args, 1)
      if (typeof args[0] !== 'string') throw new Error('split separator must be a string')
      return stringInput().split(args[0])
    }
    case 'join': {
      requireArgs(name, args, 1)
      if (!Array.isArray(input) || typeof args[0] !== 'string') throw new Error('join requires array input and a string separator')
      return input.map((item) => item === null || typeof item === 'object' ? '' : String(item)).join(args[0])
    }
    case 'sub': {
      requireArgs(name, args, 2)
      if (typeof args[0] !== 'string' || typeof args[1] !== 'string') throw new Error('sub arguments must be strings')
      return new MihomoPattern(args[0]).replace(stringInput(), args[1])
    }
    case 'test': {
      if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string') throw new Error('test expects a pattern string')
      return new MihomoPattern(args[0]).test(stringInput())
    }
    case 'reverse': {
      requireArgs(name, args, 0)
      if (!Array.isArray(input)) throw new Error('reverse requires array input')
      return [...input].reverse()
    }
    case 'unique': {
      requireArgs(name, args, 0)
      if (!Array.isArray(input)) throw new Error('unique requires array input')
      const seen = new Set<string>()
      return input.filter((item) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) return false
        seen.add(key); return true
      })
    }
    case 'select':
      requireArgs(name, args, 1)
      return truthy(args[0] ?? null) ? input : null
    default: throw new Error(`unsupported function: ${name}`)
  }
}

function evaluateBinary(operator: string, left: JsonValue, right: JsonValue): JsonValue {
  if (operator === '//') return truthy(left) ? left : right
  if (operator === 'and') return truthy(left) && truthy(right)
  if (operator === 'or') return truthy(left) || truthy(right)
  if (operator === '==') return scalarEqual(left, right)
  if (operator === '!=') return !scalarEqual(left, right)
  if (['<', '<=', '>', '>='].includes(operator)) {
    if ((typeof left !== 'number' || typeof right !== 'number') && (typeof left !== 'string' || typeof right !== 'string')) {
      throw new Error(`operator ${operator} requires two numbers or two strings`)
    }
    if (operator === '<') return left < right
    if (operator === '<=') return left <= right
    if (operator === '>') return left > right
    return left >= right
  }
  return arithmetic(operator, left, right)
}

function arithmetic(operator: string, left: JsonValue, right: JsonValue): JsonValue {
  if (operator === '+' && typeof left === 'string') return left + scalarText(right)
  if (operator === '+' && typeof right === 'string') return scalarText(left) + right
  if (operator === '+' && Array.isArray(left)) return [...left, ...(Array.isArray(right) ? right : [right])]
  if (operator === '+' && isObject(left) && isObject(right)) return { ...left, ...right }
  if (operator === '*' && isObject(left) && isObject(right)) return deepMerge(left, right)
  if (operator === '*' && typeof left === 'string' && typeof right === 'number' && Number.isInteger(right) && right >= 0) return left.repeat(right)
  if (typeof left !== 'number' || typeof right !== 'number') throw new Error(`operator ${operator} requires compatible values`)
  if (operator === '+') return left + right
  if (operator === '-') return left - right
  if (operator === '*') return left * right
  if (operator === '/') return left / right
  if (operator === '%') return left % right
  throw new Error(`unsupported operator: ${operator}`)
}

function compoundValue(operator: string, oldValue: JsonValue, value: JsonValue): JsonValue {
  if (operator === '=' || operator === '|=') return value
  return arithmetic(operator.slice(0, 1), oldValue, value)
}

function parsePath(source: string): PathSegment[] {
  const input = source.trim()
  if (!input.startsWith('.')) throw new Error(`path must start with '.': ${input}`)
  const segments: PathSegment[] = []
  let index = 1
  const readKey = (): string => {
    if (input[index] === '"') {
      const end = findStringEnd(input, index)
      const key = parseString(input.slice(index, end))
      index = end
      return key
    }
    const match = /^[\p{L}_][\p{L}\p{N}_-]*/u.exec(input.slice(index))
    if (!match) throw new Error(`expected field at column ${index + 1}`)
    index += match[0].length
    return match[0]
  }
  if (index < input.length && input[index] !== '[') segments.push({ type: 'key', key: readKey() })
  while (index < input.length) {
    if (input[index] === '.') {
      index += 1
      segments.push({ type: 'key', key: readKey() })
      continue
    }
    if (input[index] !== '[') throw new Error(`unexpected path character at column ${index + 1}`)
    const end = findClosingBracket(input, index)
    const value = input.slice(index + 1, end).trim()
    index = end + 1
    if (!value) segments.push({ type: 'wildcard' })
    else if (value.startsWith('"')) segments.push({ type: 'key', key: parseString(value) })
    else if (/^-?\d+$/.test(value)) segments.push({ type: 'index', index: Number(value) })
    else throw new Error(`invalid path index: ${value}`)
  }
  return segments
}

function resolveReferences(root: JsonValue, path: readonly PathSegment[], create: boolean): ValueReference[] {
  let references: ValueReference[] = [{ parent: undefined, key: undefined, value: root }]
  for (const [segmentIndex, segment] of path.entries()) {
    const next: ValueReference[] = []
    for (const reference of references) {
      const value = reference.value
      if (segment.type === 'wildcard') {
        if (Array.isArray(value)) value.forEach((item, key) => next.push({ parent: value, key, value: item }))
        else if (isObject(value)) Object.keys(value).sort().forEach((key) => next.push({ parent: value, key, value: value[key] ?? null }))
        continue
      }
      if (segment.type === 'key') {
        if (!isObject(value)) continue
        if (!(segment.key in value) && create) value[segment.key] = containerFor(path[segmentIndex + 1])
        if (segment.key in value) next.push({ parent: value, key: segment.key, value: value[segment.key] ?? null })
        continue
      }
      if (!Array.isArray(value)) continue
      let key = segment.index < 0 ? value.length + segment.index : segment.index
      if (key < 0) continue
      if (key >= value.length && create) {
        while (value.length <= key) value.push(null)
        value[key] = containerFor(path[segmentIndex + 1])
      }
      if (key < value.length) next.push({ parent: value, key, value: value[key] ?? null })
    }
    references = next
  }
  return references
}

function deleteReferences(references: ValueReference[]): void {
  const arrayReferences = references
    .filter((reference) => Array.isArray(reference.parent) && typeof reference.key === 'number')
    .sort((left, right) => Number(right.key) - Number(left.key))
  for (const reference of arrayReferences) (reference.parent as JsonValue[]).splice(reference.key as number, 1)
  for (const reference of references) {
    if (!Array.isArray(reference.parent) && reference.parent && typeof reference.key === 'string') delete reference.parent[reference.key]
  }
}

function splitTopLevel(source: string, delimiter: string, ignoreAssignment = false): string[] {
  const result: string[] = []
  let start = 0
  let quote = false
  let escaped = false
  let depth = 0
  for (let index = 0; index <= source.length - delimiter.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') { quote = true; continue }
    if ('([{'.includes(character ?? '')) { depth += 1; continue }
    if (')]}'.includes(character ?? '')) { depth -= 1; continue }
    if (depth !== 0 || !source.startsWith(delimiter, index)) continue
    if (ignoreAssignment && delimiter === '|' && source[index + 1] === '=') continue
    result.push(source.slice(start, index))
    start = index + delimiter.length
    index += delimiter.length - 1
  }
  result.push(source.slice(start))
  return result
}

function splitBinary(source: string, operator: string): [string, string] | undefined {
  const parts = splitTopLevel(source, operator)
  if (parts.length < 2) return undefined
  return [parts[0] ?? '', parts.slice(1).join(operator)]
}

function splitArithmetic(source: string, operators: readonly string[]): { left: string; operator: string; right: string } | undefined {
  let quote = false
  let escaped = false
  let depth = 0
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = false
      continue
    }
    if (character === '"') { quote = true; continue }
    if (')]}'.includes(character ?? '')) { depth += 1; continue }
    if ('([{'.includes(character ?? '')) { depth -= 1; continue }
    if (depth !== 0 || !operators.includes(character ?? '')) continue
    if (character === '-' && (index === 0 || '+-*/%(,'.includes(source[index - 1] ?? ''))) continue
    return { left: source.slice(0, index), operator: character ?? '', right: source.slice(index + 1) }
  }
  return undefined
}

function unwrapParentheses(source: string): string {
  let output = source
  while (output.startsWith('(') && matchingParenthesisAtEnd(output)) output = output.slice(1, -1).trim()
  return output
}

function matchingParenthesisAtEnd(source: string): boolean {
  let depth = 0
  let quote = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"' && source[index - 1] !== '\\') quote = !quote
    if (quote) continue
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && index < source.length - 1) return false
  }
  return depth === 0
}

function stripComment(source: string): string {
  let quote = false
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' && source[index - 1] !== '\\') quote = !quote
    if (!quote && source[index] === '#') return source.slice(0, index)
  }
  return source
}

function findStringEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '"' && source[index - 1] !== '\\') return index + 1
  }
  throw new Error('unterminated string')
}

function findClosingBracket(source: string, start: number): number {
  let quote = false
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '"' && source[index - 1] !== '\\') quote = !quote
    if (!quote && source[index] === ']') return index
  }
  throw new Error('unterminated path index')
}

function findTopLevelCharacter(source: string, wanted: string): number {
  const parts = splitTopLevel(source, wanted)
  return parts.length > 1 ? parts[0]?.length ?? -1 : -1
}

function parseString(source: string): string {
  try {
    const value: unknown = JSON.parse(source)
    if (typeof value !== 'string') throw new Error()
    return value
  } catch {
    throw new Error(`invalid string literal: ${source}`)
  }
}

function requireArgs(name: string, args: JsonValue[], count: number): void {
  if (args.length !== count) throw new Error(`${name} expects ${count} arguments`)
}

function containerFor(segment: PathSegment | undefined): JsonValue {
  return segment?.type === 'index' || segment?.type === 'wildcard' ? [] : {}
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truthy(value: JsonValue): boolean { return value !== null && value !== false }

function scalarEqual(left: JsonValue, right: JsonValue): boolean {
  if (typeof left === 'object' || typeof right === 'object') return false
  return left === right
}

function scalarText(value: JsonValue): string {
  if (typeof value === 'object') throw new Error('cannot concatenate a collection with a string')
  return value === null ? '' : String(value)
}

function deepMerge(left: JsonObject, right: JsonObject): JsonObject {
  const output = structuredClone(left)
  for (const [key, value] of Object.entries(right)) {
    const current = output[key]
    output[key] = isObject(current ?? null) && isObject(value) ? deepMerge(current as JsonObject, value) : structuredClone(value)
  }
  return output
}

export function validateOverrideExpression(source: string): void {
  const sample: JsonObject = {
    name: 'sample', type: 'ss', server: 'example.com', port: 443,
    alpn: ['h2'], options: {}, enabled: true,
  }
  const result = applyOverrideExpression(sample, source)
  if (!isJsonValue(result)) throw new Error('expression did not produce a JSON mapping')
}
