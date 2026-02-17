/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module editor-setup
 * @description CodeMirror 6 editor configuration.
 * Creates and manages the editor instance with markdown support,
 * syntax highlighting, theming, and extension configuration.
 *
 * @since 0.1.0
 */

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

/** Editor settings that can be updated from the C# host. */
export interface EditorSettings {
    /** Color theme: "dark" or "light". */
    theme?: 'dark' | 'light';
    /** Base font size in pixels. */
    fontSize?: number;
    /** Whether to show line numbers. */
    lineNumbers?: boolean;
    /** Whether to wrap long lines. */
    wordWrap?: boolean;
    /** Font family for the editor. */
    fontFamily?: string;
}

/** Callbacks for editor events. */
export interface EditorCallbacks {
    /** Called when the document content changes. */
    onContentChange: (content: string) => void;
    /** Called when the cursor position changes. */
    onCursorChange: (line: number, column: number) => void;
}

/** Compartments for reconfigurable extensions. */
const themeCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const lineWrappingCompartment = new Compartment();

/** The editor view instance. */
let editorView: EditorView | null = null;

/** Debounce timer for content change events. */
let changeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Creates a dark theme for the editor.
 *
 * @returns A CodeMirror theme extension.
 * @internal
 */
function darkTheme(): ReturnType<typeof EditorView.theme> {
    return EditorView.theme({
        '&': {
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
        },
        '.cm-content': {
            caretColor: '#aeafad',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: '#aeafad',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: '#264f78',
        },
        '.cm-gutters': {
            backgroundColor: '#1e1e1e',
            color: '#858585',
            borderRight: '1px solid #333',
        },
        '.cm-activeLineGutter': {
            backgroundColor: '#2a2d2e',
        },
        '.cm-activeLine': {
            backgroundColor: '#2a2d2e44',
        },
    }, { dark: true });
}

/**
 * Creates a light theme for the editor.
 *
 * @returns A CodeMirror theme extension.
 * @internal
 */
function lightTheme(): ReturnType<typeof EditorView.theme> {
    return EditorView.theme({
        '&': {
            backgroundColor: '#ffffff',
            color: '#1e1e1e',
        },
        '.cm-content': {
            caretColor: '#000',
        },
        '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: '#000',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: '#add6ff',
        },
        '.cm-gutters': {
            backgroundColor: '#f5f5f5',
            color: '#999',
            borderRight: '1px solid #ddd',
        },
        '.cm-activeLineGutter': {
            backgroundColor: '#e8e8e8',
        },
        '.cm-activeLine': {
            backgroundColor: '#f0f0f044',
        },
    });
}

/**
 * Creates the CodeMirror 6 editor instance.
 *
 * @param container - The DOM element to mount the editor into.
 * @param callbacks - Event callbacks for content and cursor changes.
 *
 * @example
 * ```typescript
 * createEditor(document.getElementById('editor')!, {
 *   onContentChange: (content) => console.log('Changed:', content),
 *   onCursorChange: (line, col) => console.log(`${line}:${col}`),
 * });
 * ```
 *
 * @since 0.1.0
 */
export function createEditor(container: HTMLElement, callbacks: EditorCallbacks): void {
    const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            // Debounce content change notifications (300ms)
            if (changeTimer) clearTimeout(changeTimer);
            changeTimer = setTimeout(() => {
                callbacks.onContentChange(update.state.doc.toString());
            }, 300);
        }

        if (update.selectionSet) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            callbacks.onCursorChange(line.number, pos - line.from + 1);
        }
    });

    const state = EditorState.create({
        doc: '',
        extensions: [
            // Core editing
            history(),
            drawSelection(),
            rectangularSelection(),
            closeBrackets(),
            bracketMatching(),
            indentOnInput(),
            highlightActiveLine(),
            highlightActiveLineGutter(),
            highlightSelectionMatches(),

            // Keymaps
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                indentWithTab,
            ]),

            // Markdown language support
            markdown({ base: markdownLanguage }),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

            // Reconfigurable compartments
            themeCompartment.of(darkTheme()),
            lineNumbersCompartment.of(lineNumbers()),
            lineWrappingCompartment.of(EditorView.lineWrapping),

            // Fold gutter for collapsible sections
            foldGutter(),

            // Content/cursor change listener
            updateListener,

            // Base styling
            EditorView.theme({
                '&': {
                    fontSize: '14px',
                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
                },
                '.cm-scroller': {
                    fontFamily: 'inherit',
                },
            }),
        ],
    });

    editorView = new EditorView({
        state,
        parent: container,
    });
}

/**
 * Sets the editor content, replacing any existing text.
 *
 * @param content - The new document content.
 *
 * @example
 * ```typescript
 * setEditorContent('# Hello World\n\nSome markdown content.');
 * ```
 */
export function setEditorContent(content: string): void {
    if (!editorView) return;

    editorView.dispatch({
        changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: content,
        },
    });
}

/**
 * Gets the current editor content.
 *
 * @returns The full document text.
 */
export function getEditorContent(): string {
    return editorView?.state.doc.toString() ?? '';
}

/**
 * Updates editor settings dynamically via compartment reconfiguration.
 *
 * @param settings - The settings to apply.
 *
 * @example
 * ```typescript
 * updateEditorSettings({ theme: 'light', fontSize: 16, lineNumbers: false });
 * ```
 */
export function updateEditorSettings(settings: EditorSettings): void {
    if (!editorView) return;

    const effects: any[] = [];

    // Theme
    if (settings.theme !== undefined) {
        effects.push(
            themeCompartment.reconfigure(
                settings.theme === 'light' ? lightTheme() : darkTheme()
            )
        );
        document.documentElement.style.setProperty(
            '--editor-bg',
            settings.theme === 'light' ? '#ffffff' : '#1e1e1e'
        );
        document.documentElement.style.setProperty(
            '--editor-fg',
            settings.theme === 'light' ? '#1e1e1e' : '#d4d4d4'
        );
    }

    // Line numbers
    if (settings.lineNumbers !== undefined) {
        effects.push(
            lineNumbersCompartment.reconfigure(
                settings.lineNumbers ? lineNumbers() : []
            )
        );
    }

    // Word wrap
    if (settings.wordWrap !== undefined) {
        effects.push(
            lineWrappingCompartment.reconfigure(
                settings.wordWrap ? EditorView.lineWrapping : []
            )
        );
    }

    // Font size
    if (settings.fontSize !== undefined) {
        const fontSize = `${settings.fontSize}px`;
        editorView.dom.style.fontSize = fontSize;
    }

    // Font family
    if (settings.fontFamily !== undefined) {
        editorView.dom.style.fontFamily = settings.fontFamily;
    }

    if (effects.length > 0) {
        editorView.dispatch({ effects });
    }
}
