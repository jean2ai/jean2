import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { kotlin } from '@codemirror/legacy-modes/mode/clike';
import { useTheme } from '@/components/providers/ThemeProvider';
import { cn } from '@/lib/utils';
import { createGitDiffExtension, type EditorGitDiff, type GitDiffExtensionController } from './gitDiffExtension';

interface CodeMirrorEditorProps {
  /** Document identity string; when it changes the editor resets via setState. */
  docId: string;
  value: string;
  language?: string;
  mimeType?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  className?: string;
  /** Git diff data for inline decorations. Pass null when no diff exists. */
  gitDiff?: EditorGitDiff | null;
  /** When false, diff decorations are hidden but cached data is preserved. */
  showGitDiff?: boolean;
}

/** Light theme built from CSS variables. */
const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: 'var(--primary)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      padding: '8px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted-foreground)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in oklch, var(--muted) 50%, transparent)',
      color: 'var(--foreground)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--primary) 20%, transparent)',
    },
    '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--primary) 25%, transparent)',
    },
    '.cm-cursor': { borderLeftColor: 'var(--primary)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      lineHeight: '1.5',
    },
  },
  { dark: false },
);

/** Dark theme built from CSS variables. */
const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: 'var(--foreground)',
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: 'var(--primary)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      padding: '8px 0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--muted-foreground)',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--foreground) 6%, transparent)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in oklch, var(--foreground) 6%, transparent)',
      color: 'var(--foreground)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--primary) 30%, transparent)',
    },
    '&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--primary) 35%, transparent)',
    },
    '.cm-cursor': { borderLeftColor: 'var(--primary)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      lineHeight: '1.5',
    },
  },
  { dark: true },
);

const highlightExtensions: Extension[] = [
  highlightActiveLine(),
  highlightActiveLineGutter(),
  highlightSelectionMatches(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
];

function buildLanguageExtension(language?: string, mimeType?: string): Extension[] {
  const lang = (language || '').toLowerCase();
  const ext = (mimeType || '').toLowerCase();
  const isJsx = lang === 'jsx' || lang === 'tsx' || ext.includes('jsx') || ext.includes('tsx');
  const isTs =
    lang === 'typescript' ||
    lang === 'ts' ||
    ext.includes('typescript') ||
    ext === 'text/typescript' ||
    ext === 'application/typescript';
  switch (lang) {
    case 'javascript':
    case 'js':
    case 'jsx':
    case 'typescript':
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: isJsx, typescript: isTs })];
    case 'json':
      return [json()];
    case 'markdown':
    case 'md':
    case 'mdx':
      return [markdown()];
    case 'css':
    case 'scss':
    case 'less':
      return [css()];
    case 'html':
    case 'xml':
    case 'svg':
      return [html()];
    case 'go':
    case 'golang':
      return [go()];
    case 'python':
    case 'py':
    case 'pyw':
      return [python()];
    case 'php':
      return [php()];
    case 'kotlin':
    case 'kt':
    case 'kts':
      return [StreamLanguage.define(kotlin)];
    case 'java':
      return [java()];
    case 'sql':
      return [sql()];
    default:
      return [];
  }
}

/**
 * Direct CodeMirror 6 integration.
 *
 * The CodeMirror instance is kept local via a ref. When the document identity
 * changes we use view.setState(...) (not dispatch) so old undo history cannot
 * leak across files. Typing updates flow out to the store through the
 * updateListener; external content resets (reload/discard/conflict) are pushed
 * back in via setState, guarded by a last-emitted ref to avoid feedback loops.
 */
export function CodeMirrorEditor({
  docId,
  value,
  language,
  mimeType,
  readOnly = false,
  onChange,
  className,
  gitDiff = null,
  showGitDiff = true,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef<Compartment | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const gitDiffControllerRef = useRef<GitDiffExtensionController | null>(null);
  const previousDocIdRef = useRef(docId);
  const appliedGitDiffRef = useRef<EditorGitDiff | null>(gitDiff);
  const appliedGitDiffVisibilityRef = useRef(showGitDiff);

  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';

  // Latest props in refs so imperative handlers read fresh values.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef<string>(value);

  /**
   * Build the full extension array, reusing the provided Compartment instances
   * so reconfigure effects remain valid after a setState reset.
   */
  const buildExtensions = (
    themeCompartment: Compartment,
    languageCompartment: Compartment,
    readOnlyCompartment: Compartment,
    gitDiffController: GitDiffExtensionController,
    initialLanguage: string | undefined,
    initialMime: string | undefined,
    initialReadOnly: boolean,
    initialIsDark: boolean,
  ): Extension[] => [
    lineNumbers(),
    history(),
    foldGutter(),
    drawSelection(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    highlightExtensions,
    gitDiffController.extension,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        lastEmittedRef.current = text;
        onChangeRef.current(text);
      }
    }),
    themeCompartment.of(initialIsDark ? darkTheme : lightTheme),
    languageCompartment.of(buildLanguageExtension(initialLanguage, initialMime)),
    readOnlyCompartment.of(EditorState.readOnly.of(initialReadOnly)),
  ];

  // Create the editor once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const themeCompartment = new Compartment();
    const languageCompartment = new Compartment();
    const readOnlyCompartment = new Compartment();
    const gitDiffController = createGitDiffExtension();
    languageCompartmentRef.current = languageCompartment;
    themeCompartmentRef.current = themeCompartment;
    readOnlyCompartmentRef.current = readOnlyCompartment;
    gitDiffControllerRef.current = gitDiffController;

    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        gitDiffController,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    lastEmittedRef.current = value;

    if (gitDiff && showGitDiff) {
      gitDiffController.setDiff(view, gitDiff);
    }
    appliedGitDiffRef.current = gitDiff;
    appliedGitDiffVisibilityRef.current = showGitDiff;

    return () => {
      view.destroy();
      viewRef.current = null;
      languageCompartmentRef.current = null;
      themeCompartmentRef.current = null;
      readOnlyCompartmentRef.current = null;
      gitDiffControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External document identity change: reset the whole state via setState
  // so undo history does not leak across files. We reuse the same Compartment
  // instances so theme/language/readOnly reconfigure effects keep working.
  useEffect(() => {
    if (previousDocIdRef.current === docId) return;
    previousDocIdRef.current = docId;

    const view = viewRef.current;
    const themeCompartment = themeCompartmentRef.current;
    const languageCompartment = languageCompartmentRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    const gitDiffController = gitDiffControllerRef.current;
    if (!view || !themeCompartment || !languageCompartment || !readOnlyCompartment || !gitDiffController) return;
    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        gitDiffController,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });
    view.setState(state);
    lastEmittedRef.current = value;
    if (gitDiff && showGitDiff) {
      gitDiffController.setDiff(view, gitDiff);
    }
    appliedGitDiffRef.current = gitDiff;
    appliedGitDiffVisibilityRef.current = showGitDiff;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Theme changes: reconfigure the theme compartment.
  useEffect(() => {
    const view = viewRef.current;
    const compartment = themeCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({ effects: compartment.reconfigure(isDark ? darkTheme : lightTheme) });
  }, [isDark]);

  // Language changes (same doc, different language): reconfigure compartment.
  useEffect(() => {
    const view = viewRef.current;
    const compartment = languageCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({
      effects: compartment.reconfigure(buildLanguageExtension(language, mimeType)),
    });
  }, [language, mimeType]);

  // Read-only changes: reconfigure compartment.
  useEffect(() => {
    const view = viewRef.current;
    const compartment = readOnlyCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({ effects: compartment.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  // External content changes for the same doc (reload/discard/conflict
  // resolution): push in via setState only when the value differs from what we
  // last emitted, to avoid feedback loops while typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastEmittedRef.current) return;
    const current = view.state.doc.toString();
    if (value === current) {
      lastEmittedRef.current = value;
      return;
    }
    const themeCompartment = themeCompartmentRef.current;
    const languageCompartment = languageCompartmentRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    const gitDiffController = gitDiffControllerRef.current;
    if (!themeCompartment || !languageCompartment || !readOnlyCompartment || !gitDiffController) return;
    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        gitDiffController,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });
    view.setState(state);
    lastEmittedRef.current = value;
    if (gitDiff && showGitDiff) {
      gitDiffController.setDiff(view, gitDiff);
    }
    appliedGitDiffRef.current = gitDiff;
    appliedGitDiffVisibilityRef.current = showGitDiff;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Replace decorations only when the authoritative diff or visibility changes.
  useEffect(() => {
    const view = viewRef.current;
    const controller = gitDiffControllerRef.current;
    if (!view || !controller) return;

    const visibilityChanged = appliedGitDiffVisibilityRef.current !== showGitDiff;
    const diffChanged = appliedGitDiffRef.current !== gitDiff;

    if (!showGitDiff) {
      if (visibilityChanged) {
        controller.setDiff(view, null);
      }
      appliedGitDiffRef.current = gitDiff;
      appliedGitDiffVisibilityRef.current = false;
      return;
    }

    if (visibilityChanged || diffChanged) {
      controller.setDiff(view, gitDiff);
      appliedGitDiffRef.current = gitDiff;
      appliedGitDiffVisibilityRef.current = true;
    }
  }, [gitDiff, showGitDiff]);

  return (
    <div
      ref={hostRef}
      data-cm-editor
      data-doc-id={docId}
      className={cn('h-full w-full overflow-hidden', className)}
    />
  );
}
