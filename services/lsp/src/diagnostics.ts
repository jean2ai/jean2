import { DiagnosticSeverity, type Diagnostic } from '@/types';

export class DiagnosticsManager {
  private diagnostics: Map<string, Diagnostic[]> = new Map();

  updateDiagnostics(uri: string, diagnostics: Diagnostic[]): void {
    this.diagnostics.set(uri, diagnostics);
  }

  getDiagnostics(uri: string): Diagnostic[] {
    return this.diagnostics.get(uri) ?? [];
  }

  getAllDiagnostics(): Map<string, Diagnostic[]> {
    return new Map(this.diagnostics);
  }

  clearDiagnostics(uri: string): void {
    this.diagnostics.delete(uri);
  }

  clearAll(): void {
    this.diagnostics.clear();
  }

  hasErrors(): boolean {
    for (const diagnostics of this.diagnostics.values()) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === DiagnosticSeverity.Error) {
          return true;
        }
      }
    }
    return false;
  }

  getErrorCount(): number {
    let count = 0;
    for (const diagnostics of this.diagnostics.values()) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === DiagnosticSeverity.Error) {
          count++;
        }
      }
    }
    return count;
  }

  formatDiagnostic(diagnostic: Diagnostic): string {
    const severityLabel = this.getSeverityLabel(diagnostic.severity);
    const line = diagnostic.range.start.line + 1;
    const column = diagnostic.range.start.character + 1;
    return `[${severityLabel}] Line ${line}, Col ${column}: ${diagnostic.message}`;
  }

  formatDiagnosticsForFile(uri: string): string {
    const diagnostics = this.getDiagnostics(uri);
    if (diagnostics.length === 0) {
      return '';
    }
    return diagnostics.map((d) => this.formatDiagnostic(d)).join('\n');
  }

  private getSeverityLabel(severity: DiagnosticSeverity): string {
    switch (severity) {
      case DiagnosticSeverity.Error:
        return 'Error';
      case DiagnosticSeverity.Warning:
        return 'Warning';
      case DiagnosticSeverity.Information:
        return 'Info';
      case DiagnosticSeverity.Hint:
        return 'Hint';
      default:
        return 'Unknown';
    }
  }
}
