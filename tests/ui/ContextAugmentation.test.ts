/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextAugmentation } from '../../src/chat/processing/ContextAugmentation';
import { App, TFile, MarkdownView, Vault, Workspace, MetadataCache } from 'obsidian';

describe('ContextAugmentation', () => {
	let mockApp: App;
	let contextAugmentation: ContextAugmentation;
	let mockVault: Vault;
	let mockWorkspace: Workspace;

	beforeEach(() => {
		// Create mock vault
		mockVault = {
			cachedRead: vi.fn(),
		} as unknown as Vault;

		// Create mock workspace
		mockWorkspace = {
			getActiveFile: vi.fn(),
			getActiveViewOfType: vi.fn(),
			getLeavesOfType: vi.fn(() => []),
		} as unknown as Workspace;

		// Create mock app
		mockApp = {
			vault: mockVault,
			workspace: mockWorkspace,
			metadataCache: {} as MetadataCache,
		} as unknown as App;

		contextAugmentation = new ContextAugmentation(mockApp);
	});

	describe('getSelectedText', () => {
		it('should return null when no active view', () => {
			vi.mocked(mockWorkspace.getActiveViewOfType).mockReturnValue(null);

			const result = contextAugmentation.getSelectedText();

			expect(result).toBeNull();
		});

		it('should return null when no selection', () => {
			const mockEditor = {
				getSelection: vi.fn(() => ''),
			};

			const mockView = {
				editor: mockEditor,
				file: new TFile('test.md'),
			} as unknown as MarkdownView;

			vi.mocked(mockWorkspace.getActiveViewOfType).mockReturnValue(mockView);

			const result = contextAugmentation.getSelectedText();

			expect(result).toBeNull();
		});

		it('should return selected text with file', () => {
			const mockFile = new TFile('test.md');

			const mockEditor = {
				getSelection: vi.fn(() => 'Selected text here'),
			};

			const mockView = {
				editor: mockEditor,
				file: mockFile,
			} as unknown as MarkdownView;

			vi.mocked(mockWorkspace.getActiveViewOfType).mockReturnValue(mockView);

			const result = contextAugmentation.getSelectedText();

			expect(result).not.toBeNull();
			expect(result?.text).toBe('Selected text here');
			expect(result?.file.path).toBe('test.md');
		});
	});

	describe('getOpenTabs', () => {
		it('should return empty array when no tabs open', () => {
			vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([]);

			const result = contextAugmentation.getOpenTabs();

			expect(result).toEqual([]);
		});

		it('should return all open markdown tabs', () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');

			const mockView1 = {
				file: file1,
			} as MarkdownView;

			const mockView2 = {
				file: file2,
			} as MarkdownView;

			const mockLeaf1 = { view: mockView1 };
			const mockLeaf2 = { view: mockView2 };

			vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf1, mockLeaf2] as any);
			vi.mocked(mockWorkspace.getActiveFile).mockReturnValue(file1);

			const result = contextAugmentation.getOpenTabs();

			expect(result).toHaveLength(2);
			expect(result[0]?.file.path).toBe('file1.md');
			expect(result[0]?.isActive).toBe(true);
			expect(result[1]?.file.path).toBe('file2.md');
			expect(result[1]?.isActive).toBe(false);
		});
	});

	describe('getOpenTabsContent', () => {
		it('should read content from all open tabs', async () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');

			const mockView1 = {
				file: file1,
			} as MarkdownView;

			const mockView2 = {
				file: file2,
			} as MarkdownView;

			const mockLeaf1 = { view: mockView1 };
			const mockLeaf2 = { view: mockView2 };

			vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf1, mockLeaf2] as any);
			vi.mocked(mockWorkspace.getActiveFile).mockReturnValue(file1);

			vi.mocked(mockVault.cachedRead)
				.mockResolvedValueOnce('Content of file1')
				.mockResolvedValueOnce('Content of file2');

			const result = await contextAugmentation.getOpenTabsContent();

			expect(result.size).toBe(2);
			expect(result.get('file1.md')).toBe('Content of file1');
			expect(result.get('file2.md')).toBe('Content of file2');
		});

		it('should continue on error reading individual files', async () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');

			const mockView1 = {
				file: file1,
			} as MarkdownView;

			const mockView2 = {
				file: file2,
			} as MarkdownView;

			const mockLeaf1 = { view: mockView1 };
			const mockLeaf2 = { view: mockView2 };

			vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf1, mockLeaf2] as any);

			vi.mocked(mockVault.cachedRead)
				.mockRejectedValueOnce(new Error('Read error'))
				.mockResolvedValueOnce('Content of file2');

			const result = await contextAugmentation.getOpenTabsContent();

			expect(result.size).toBe(1);
			expect(result.get('file2.md')).toBe('Content of file2');
		});
	});

	describe('gatherImplicitContext', () => {
		it('should gather all available context', async () => {
			const activeFile = new TFile('active.md');
			const file2 = new TFile('file2.md');

			vi.mocked(mockWorkspace.getActiveFile).mockReturnValue(activeFile);
			vi.mocked(mockVault.cachedRead)
				.mockResolvedValueOnce('Active file content')
				.mockResolvedValueOnce('Active file content')
				.mockResolvedValueOnce('File 2 content');

			const mockEditor = {
				getSelection: vi.fn(() => 'Selected text'),
			};

			const mockView1 = {
				editor: mockEditor,
				file: activeFile,
			} as unknown as MarkdownView;

			const mockView2 = {
				file: file2,
			} as MarkdownView;

			const mockLeaf1 = { view: mockView1 };
			const mockLeaf2 = { view: mockView2 };

			vi.mocked(mockWorkspace.getActiveViewOfType).mockReturnValue(mockView1);
			vi.mocked(mockWorkspace.getLeavesOfType).mockReturnValue([mockLeaf1, mockLeaf2] as any);

			const result = await contextAugmentation.gatherImplicitContext();

			expect(result.activeFile).toBe(activeFile);
			expect(result.activeFileContent).toBe('Active file content');
			expect(result.selectedText).not.toBeNull();
			expect(result.selectedText?.text).toBe('Selected text');
			expect(result.openTabs).toHaveLength(2);
			expect(result.openTabsContent.size).toBe(2);
		});
	});

	describe('formatImplicitContext', () => {
		it('should format context with selected text', () => {
			const file = new TFile('test.md');

			const context = {
				activeFile: file,
				activeFileContent: 'File content',
				selectedText: {
					text: 'Selected text',
					file: file,
				},
				openTabs: [{ file, isActive: true }],
				openTabsContent: new Map([['test.md', 'File content']]),
			};

			const result = contextAugmentation.formatImplicitContext(context);

			expect(result).toContain('Selected Text');
			expect(result).toContain('Selected text');
			expect(result).toContain('Active File');
			expect(result).toContain('File content');
		});

		it('should format context with multiple open tabs', () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');

			const context = {
				activeFile: file1,
				activeFileContent: 'Content 1',
				selectedText: null,
				openTabs: [
					{ file: file1, isActive: true },
					{ file: file2, isActive: false },
				],
				openTabsContent: new Map([
					['file1.md', 'Content 1'],
					['file2.md', 'Content 2'],
				]),
			};

			const result = contextAugmentation.formatImplicitContext(context);

			expect(result).toContain('Active File');
			expect(result).toContain('file1.md');
			expect(result).toContain('Other Open Tabs (1)');
			expect(result).toContain('file2'); // Now using basename, not full path
			expect(result).toContain('Content 2');
		});
	});

	describe('getContextSummary', () => {
		it('should provide a summary of context', () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');

			const context = {
				activeFile: file1,
				activeFileContent: 'Content 1',
				selectedText: {
					text: 'Selected text here',
					file: file1,
				},
				openTabs: [
					{ file: file1, isActive: true },
					{ file: file2, isActive: false },
				],
				openTabsContent: new Map(),
			};

			const result = contextAugmentation.getContextSummary(context);

			expect(result).toHaveLength(3);
			expect(result[0]).toContain('Selected text');
			expect(result[0]).toContain('18 chars');
			expect(result[1]).toContain('Active file: file1');
			expect(result[2]).toContain('1 other open tab');
		});
	});

	describe('getOtherOpenTabs', () => {
		it('should return only non-active tabs', () => {
			const file1 = new TFile('file1.md');
			const file2 = new TFile('file2.md');
			const file3 = new TFile('file3.md');

			const context = {
				activeFile: file1,
				activeFileContent: 'Content 1',
				selectedText: null,
				openTabs: [
					{ file: file1, isActive: true },
					{ file: file2, isActive: false },
					{ file: file3, isActive: false },
				],
				openTabsContent: new Map(),
			};

			const result = contextAugmentation.getOtherOpenTabs(context);

			expect(result).toHaveLength(2);
			expect(result[0]?.file.path).toBe('file2.md');
			expect(result[1]?.file.path).toBe('file3.md');
			expect(result.every(tab => !tab.isActive)).toBe(true);
		});

		it('should return empty array when only active tab is open', () => {
			const file1 = new TFile('file1.md');

			const context = {
				activeFile: file1,
				activeFileContent: 'Content 1',
				selectedText: null,
				openTabs: [
					{ file: file1, isActive: true },
				],
				openTabsContent: new Map(),
			};

			const result = contextAugmentation.getOtherOpenTabs(context);

			expect(result).toHaveLength(0);
		});
	});
});



