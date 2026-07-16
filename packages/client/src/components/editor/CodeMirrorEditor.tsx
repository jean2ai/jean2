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
  syntaxHighlighting,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { useTheme } from '@/components/providers/ThemeProvider';
import { cn } from '@/lib/utils';

interface CodeMirrorEditorProps {
  /** Document identity string; when it changes the editor resets via setState. */
  docId: string;
  value: string;
  language?: string;
  mimeType?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  className?: string;
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
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef<Compartment | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);

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
    languageCompartmentRef.current = languageCompartment;
    themeCompartmentRef.current = themeCompartment;
    readOnlyCompartmentRef.current = readOnlyCompartment;

    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    lastEmittedRef.current = value;

    return () => {
      view.destroy();
      viewRef.current = null;
      languageCompartmentRef.current = null;
      themeCompartmentRef.current = null;
      readOnlyCompartmentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External document identity change: reset the whole state via setState
  // so undo history does not leak across files. We reuse the same Compartment
  // instances so theme/language/readOnly reconfigure effects keep working.
  useEffect(() => {
    const view = viewRef.current;
    const themeCompartment = themeCompartmentRef.current;
    const languageCompartment = languageCompartmentRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    if (!view || !themeCompartment || !languageCompartment || !readOnlyCompartment) return;
    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });
    view.setState(state);
    lastEmittedRef.current = value;
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
    if (!themeCompartment || !languageCompartment || !readOnlyCompartment) return;
    const state = EditorState.create({
      doc: value,
      extensions: buildExtensions(
        themeCompartment,
        languageCompartment,
        readOnlyCompartment,
        language,
        mimeType,
        readOnly,
        isDark,
      ),
    });
    view.setState(state);
    lastEmittedRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      ref={hostRef}
      data-cm-editor
      data-doc-id={docId}
      className={cn('h-full w-full overflow-hidden', className)}
    />
  );
}
