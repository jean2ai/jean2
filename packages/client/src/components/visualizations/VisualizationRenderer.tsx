import type { AnyVisualization } from '@jean2/shared';
import { DiffViewer } from './DiffViewer';
import { CodeBlock } from './CodeBlock';
import { FileListViewer } from './FileListViewer';
import { SuccessIndicator } from './SuccessIndicator';
import { TerminalOutput } from './TerminalOutput';

interface VisualizationRendererProps {
  visualization?: AnyVisualization;
}

export function VisualizationRenderer({ visualization }: VisualizationRendererProps) {
  if (!visualization) {
    return null;
  }

  switch (visualization.type) {
    case 'diff':
      return (
        <DiffViewer
          path={visualization.path}
          hunks={visualization.hunks}
          language={visualization.language}
          additions={visualization.additions}
          deletions={visualization.deletions}
          matchInfo={visualization.matchInfo}
        />
      );

    case 'code':
      return (
        <CodeBlock
          path={visualization.path}
          content={visualization.content}
          language={visualization.language}
          created={visualization.created}
          highlightLines={visualization.highlightLines}
        />
      );

    case 'file-list':
      return (
        <FileListViewer
          title={visualization.title}
          groups={visualization.groups}
          files={visualization.files}
          total={visualization.total}
        />
      );

    case 'table':
      return (
        <pre className="text-xs bg-muted/50 border rounded-md p-2 overflow-x-auto">
          {JSON.stringify(visualization.rows, null, 2)}
        </pre>
      );

    case 'markdown':
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {visualization.content}
        </div>
      );

    case 'none':
      return <SuccessIndicator message={visualization.message} />;

    case 'shell-output':
      return (
        <TerminalOutput
          command={visualization.command}
          stdout={visualization.stdout}
          stderr={visualization.stderr}
          exitCode={visualization.exitCode}
        />
      );

    default:
      return null;
  }
}
