// @file: check-artifacts.ts
// @desc: validate artifact syntax without execution
import ts from 'typescript';

export function checkArtifactSyntax(files: { path: string; content: string }[]): string[] {
  return files.flatMap(file => {
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(file.content);
        return [];
      } catch (error) {
        return [`${file.path}: ${error instanceof Error ? error.message : String(error)}`];
      }
    }
    if (!/\.[cm]?[jt]s$/.test(file.path)) return [];
    const result = ts.transpileModule(file.content, {
      fileName: file.path,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, allowJs: true },
    });
    return (result.diagnostics ?? [])
      .filter(item => item.category === ts.DiagnosticCategory.Error)
      .map(item => `${file.path} TS${item.code}: ${ts.flattenDiagnosticMessageText(item.messageText, '\n')}`);
  });
}
