export type DiagnosticSeverity = 'error' | 'warning'

export type Diagnostic = {
  severity: DiagnosticSeverity
  code: string
  message: string
  location?: string
}
