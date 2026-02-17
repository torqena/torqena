/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module editor-bridge
 * @description Entry point for the CodeMirror 6 editor in the MAUI WebView.
 * Sets up the editor, configures extensions, and manages the C#↔JS message bridge.
 *
 * Message protocol (JSON via postMessage / window.chrome.webview.postMessage):
 *
 * Inbound (C# → JS):
 * - { type: "setContent", filePath: string, content: string }
 * - { type: "updateSettings", settings: { theme?: "dark"|"light", fontSize?: number, lineNumbers?: boolean, wordWrap?: boolean } }
 * - { type: "getContent" }
 *
 * Outbound (JS → C#):
 * - { type: "ready" }
 * - { type: "contentChanged", filePath: string, content: string }
 * - { type: "cursorChanged", line: number, column: number }
 *
 * @since 0.1.0
 */

import { createEditor, setEditorContent, updateEditorSettings, getEditorContent } from './editor-setup';
import type { EditorSettings } from './editor-setup';

/** Currently active file path in the editor. */
let currentFilePath = '';

/**
 * Sends a JSON message to the C# host via the WebView bridge.
 *
 * @param message - The message object to send.
 * @internal
 */
function postToHost(message: Record<string, unknown>): void {
    const json = JSON.stringify(message);

    // MAUI WebView on Windows uses window.chrome.webview
    if ((window as any).chrome?.webview?.postMessage) {
        (window as any).chrome.webview.postMessage(json);
    }
    // MAUI WebView on iOS/macOS uses window.webkit.messageHandlers
    else if ((window as any).webkit?.messageHandlers?.webwindowinterop) {
        (window as any).webkit.messageHandlers.webwindowinterop.postMessage(json);
    }
    // Android uses a JS interface
    else if ((window as any).jsBridge?.postMessage) {
        (window as any).jsBridge.postMessage(json);
    }
    // Fallback for dev/testing
    else {
        console.log('[EditorBridge] postToHost:', json);
    }
}

/**
 * Handles incoming messages from the C# host.
 *
 * @param data - The parsed message data from the host.
 * @internal
 */
function handleHostMessage(data: any): void {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'setContent': {
            currentFilePath = data.filePath ?? '';
            setEditorContent(data.content ?? '');
            break;
        }
        case 'updateSettings': {
            if (data.settings) {
                updateEditorSettings(data.settings as EditorSettings);
            }
            break;
        }
        case 'getContent': {
            postToHost({
                type: 'contentChanged',
                filePath: currentFilePath,
                content: getEditorContent(),
            });
            break;
        }
    }
}

/**
 * Initializes the editor and message listeners.
 * @internal
 */
function init(): void {
    const container = document.getElementById('editor');
    if (!container) {
        console.error('[EditorBridge] #editor element not found');
        return;
    }

    // Create the CodeMirror 6 editor instance
    createEditor(container, {
        onContentChange: (content: string) => {
            postToHost({
                type: 'contentChanged',
                filePath: currentFilePath,
                content,
            });
        },
        onCursorChange: (line: number, column: number) => {
            postToHost({
                type: 'cursorChanged',
                line,
                column,
            });
        },
    });

    // Listen for messages via postMessage (C# EvaluateJavaScriptAsync sends these)
    window.addEventListener('message', (event: MessageEvent) => {
        handleHostMessage(event.data);
    });

    // Notify the host that the editor is ready
    postToHost({ type: 'ready' });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
