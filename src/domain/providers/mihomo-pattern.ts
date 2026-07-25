const maximumPatternLength = 1024
const maximumInputLength = 4096

export class MihomoPattern {
  readonly source: string
  readonly flags: string

  constructor(pattern: string) {
    if (pattern.length > maximumPatternLength) {
      throw new Error(`Provider pattern exceeds ${maximumPatternLength} characters`)
    }

    const inlineFlags = /^\(\?([ims]+)\)/u.exec(pattern)
    this.source = inlineFlags ? pattern.slice(inlineFlags[0].length) : pattern
    this.flags = [...new Set([...(inlineFlags?.[1] ?? ''), 'u'])].join('')

    try {
      void new RegExp(this.source, this.flags)
    } catch (cause) {
      throw new Error(`Invalid provider filter pattern: ${pattern}`, { cause })
    }
  }

  test(input: string): boolean {
    if (input.length > maximumInputLength) {
      return false
    }
    return new RegExp(this.source, this.flags).test(input)
  }

  replace(input: string, target: string): string {
    if (input.length > maximumInputLength) {
      throw new Error(`Provider name exceeds ${maximumInputLength} characters`)
    }
    return input.replace(new RegExp(this.source, `${this.flags}g`), target)
  }
}

export function compilePatternList(value: string | undefined): MihomoPattern[] {
  if (value === undefined || value.length === 0) {
    return []
  }
  return value.split('`').map((pattern) => new MihomoPattern(pattern))
}
