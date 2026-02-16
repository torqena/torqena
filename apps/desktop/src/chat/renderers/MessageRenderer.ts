import { App, MarkdownRenderer, Component } from "obsidian";
import { ChatMessage } from "../../ai/providers/GitHubCopilotCliService";

/**
 * Represents a reference used in a chat message
 */
export interface UsedReference {
	/** Type of reference */
	type: "agent" | "instruction" | "context" | "url" | "workspace";
	/** Display name */
	name: string;
	/** File path (for files) or URL (for web) */
	path: string;
}

/**
 * Handles rendering of chat messages with markdown support and copy functionality
 */
export class MessageRenderer {
	private app: App;
	private component: Component;

	constructor(app: App, component: Component) {
		this.app = app;
		this.component = component;
	}

	/**
	 * Create a message element for the chat
	 */
	createMessageElement(container: HTMLElement, role: "user" | "assistant", content: string): HTMLElement {
		const messageEl = container.createDiv({ 
			cls: `vc-message vc-message-${role}` 
		});
		
		messageEl.createDiv({ cls: "vc-message-content", text: content });

		return messageEl;
	}

	/**
	 * Render a chat message with markdown
	 * @returns The created message element
	 */
	async renderMessage(container: HTMLElement, message: ChatMessage): Promise<HTMLElement> {
		const messageEl = this.createMessageElement(container, message.role, "");
		await this.renderMarkdownContent(messageEl, message.content);
		if (message.role === "assistant") {
			this.addCopyButton(messageEl);
		}
		return messageEl;
	}

	/**
	 * Render markdown content in a message element
	 */
	async renderMarkdownContent(messageEl: HTMLElement, content: string): Promise<void> {
		const contentEl = messageEl.querySelector(".vc-message-content");
		if (contentEl) {
			contentEl.empty();
			await MarkdownRenderer.render(
				this.app,
				content,
				contentEl as HTMLElement,
				"",
				this.component
			);
			// Make internal links clickable
			this.registerInternalLinks(contentEl as HTMLElement);
		}
	}

	/**
	 * Register click handlers for internal and external links
	 */
	registerInternalLinks(container: HTMLElement): void {
		// Handle internal links (data-href attribute set by MarkdownRenderer)
		const internalLinks = container.querySelectorAll("a.internal-link");
		internalLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const href = link.getAttribute("data-href") || link.getAttribute("href");
				if (href) {
					this.app.workspace.openLinkText(href, "", false);
				}
			});
		});

		// Handle external links
		const externalLinks = container.querySelectorAll("a.external-link, a[href^='http']");
		externalLinks.forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const href = link.getAttribute("href");
				if (href) {
					window.open(href, "_blank");
				}
			});
		});
	}

	/**
	 * Add a copy button to a message element
	 */
	addCopyButton(messageEl: HTMLElement): void {
		const contentEl = messageEl.querySelector(".vc-message-content");
		if (!contentEl) return;

		const actionsEl = messageEl.createDiv({ cls: "vc-message-actions" });
		
		// Speaker button (TTS) - on the left
		const speakerBtn = actionsEl.createEl("button", { cls: "vc-speaker-btn", attr: { "aria-label": "Read aloud" } });
		speakerBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
		speakerBtn.addEventListener("click", async () => {
			const text = (contentEl as HTMLElement).textContent || "";
			await this.sendToTTS(text, speakerBtn);
		});

		// Copy button - on the right
		const copyBtn = actionsEl.createEl("button", { cls: "vc-copy-btn", attr: { "aria-label": "Copy to clipboard" } });
		copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
		copyBtn.addEventListener("click", async () => {
			// If text is highlighted, copy only the selection; otherwise copy whole block
			const selection = window.getSelection();
			let html = "";
			let text = "";
			if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
				// Clone selection into a temp container
				const range = selection.getRangeAt(0);
				const tempDiv = document.createElement("div");
				tempDiv.appendChild(range.cloneContents());
				html = tempDiv.innerHTML;
				text = this.extractTextWithLinks(tempDiv);
			} else {
				html = (contentEl as HTMLElement).innerHTML;
				text = this.extractTextWithLinks(contentEl as HTMLElement);
			}
			
			try {
				// Copy both HTML (for rich paste) and plain text (markdown fallback)
				await navigator.clipboard.write([
					new ClipboardItem({
						"text/html": new Blob([html], { type: "text/html" }),
						"text/plain": new Blob([text], { type: "text/plain" })
					})
				]);
				console.log("Copied to clipboard");
				copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
				setTimeout(() => {
					copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
				}, 2000);
			} catch {
				console.error("Failed to copy");
			}
		});
	}

	/**
	 * Extract text content with markdown-formatted links from an HTML element
	 */
	extractTextWithLinks(element: HTMLElement): string {
		let result = "";
		
		const processNode = (node: Node): void => {
			if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				const tagName = el.tagName.toLowerCase();
				
				if (tagName === "a") {
					const linkText = el.textContent || "";
					const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
					
					// Check if it's an internal Obsidian link
					if (el.classList.contains("internal-link")) {
						result += `[[${href}]]`;
					} else if (href) {
						result += `[${linkText}](${href})`;
					} else {
						result += linkText;
					}
				} else if (tagName === "br") {
					result += "\n";
				} else if (tagName === "p") {
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
					result += "\n\n";
				} else if (tagName === "code" && el.parentElement?.tagName.toLowerCase() !== "pre") {
					result += "`" + (el.textContent || "") + "`";
				} else if (tagName === "pre") {
					const codeEl = el.querySelector("code");
					const lang = codeEl?.className.match(/language-(\w+)/)?.[1] || "";
					result += "```" + lang + "\n" + (el.textContent || "") + "\n```\n";
				} else if (tagName === "strong" || tagName === "b") {
					result += "**" + (el.textContent || "") + "**";
				} else if (tagName === "em" || tagName === "i") {
					result += "*" + (el.textContent || "") + "*";
				} else if (tagName === "li") {
					result += "- ";
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
					result += "\n";
				} else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
					const level = parseInt(tagName.charAt(1), 10);
					result += "#".repeat(level) + " " + (el.textContent || "") + "\n\n";
				} else {
					for (const child of Array.from(el.childNodes)) {
						processNode(child);
					}
				}
			}
		};
		
		for (const child of Array.from(element.childNodes)) {
			processNode(child);
		}
		
		return result.trim();
	}

	/**
	 * Add an error message to the chat
	 */
	addErrorMessage(container: HTMLElement, error: string): void {
		const errorEl = container.createDiv({ cls: "vc-error" });
		errorEl.createEl("span", { text: `Error: ${error}` });
	}

	/**
	 * Render a collapsible "Used X references" section after a message
	 * @param container The container to append to
	 * @param references Array of references used in the message
	 */
	renderUsedReferences(container: HTMLElement, references: UsedReference[]): HTMLElement | null {
		if (references.length === 0) {
			return null;
		}

		const refsEl = container.createDiv({ cls: "vc-used-references" });
		
		// Header with toggle
		const headerEl = refsEl.createDiv({ cls: "vc-refs-header" });
		
		const toggleIcon = headerEl.createSpan({ cls: "vc-refs-toggle-icon" });
		toggleIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
		
		headerEl.createSpan({ 
			cls: "vc-refs-label", 
			text: `Used ${references.length} reference${references.length > 1 ? 's' : ''}` 
		});
		
		// Content (collapsed by default)
		const contentEl = refsEl.createDiv({ cls: "vc-refs-content" });
		contentEl.style.display = "none";
		
		// Group references by type
		const agents = references.filter(r => r.type === "agent");
		const instructions = references.filter(r => r.type === "instruction");
		const contexts = references.filter(r => r.type === "context");
		const urls = references.filter(r => r.type === "url");
		
		// Render grouped references
		if (agents.length > 0) {
			this.renderRefGroup(contentEl, "Agent", agents, "bot");
		}
		if (instructions.length > 0) {
			this.renderRefGroup(contentEl, "Instructions", instructions, "scroll-text");
		}
		if (contexts.length > 0) {
			this.renderRefGroup(contentEl, "Context", contexts, "file-text");
		}
		if (urls.length > 0) {
			this.renderRefGroup(contentEl, "URLs", urls, "globe");
		}
		
		// Toggle handler
		headerEl.addEventListener("click", () => {
			const isExpanded = contentEl.style.display !== "none";
			contentEl.style.display = isExpanded ? "none" : "block";
			refsEl.toggleClass("vc-refs-expanded", !isExpanded);
		});
		
		return refsEl;
	}

	/**
	 * Render a group of references
	 */
	private renderRefGroup(container: HTMLElement, label: string, refs: UsedReference[], iconName: string): void {
		const groupEl = container.createDiv({ cls: "vc-refs-group" });
		
		// Group label with icon
		const labelEl = groupEl.createDiv({ cls: "vc-refs-group-label" });
		const icon = this.getIcon(iconName);
		labelEl.innerHTML = icon;
		labelEl.createSpan({ text: ` ${label}` });
		
		// Reference items
		const listEl = groupEl.createDiv({ cls: "vc-refs-list" });
		for (const ref of refs) {
			const itemEl = listEl.createDiv({ cls: "vc-refs-item" });
			
			// File icon
			const fileIcon = itemEl.createSpan({ cls: "vc-refs-item-icon" });
			if (ref.type === "url") {
				fileIcon.innerHTML = this.getIcon("link");
			} else {
				fileIcon.innerHTML = this.getIcon("file");
			}
			
			// Name (clickable for files)
			const nameEl = itemEl.createSpan({ cls: "vc-refs-item-name", text: ref.name });
			
			if (ref.type !== "url" && ref.path) {
				nameEl.addClass("vc-refs-clickable");
				nameEl.addEventListener("click", (e) => {
					e.stopPropagation();
					this.app.workspace.openLinkText(ref.path, "", false);
				});
			} else if (ref.type === "url") {
				nameEl.addClass("vc-refs-clickable");
				nameEl.addEventListener("click", (e) => {
					e.stopPropagation();
					window.open(ref.path, "_blank");
				});
			}
			
			// Path hint
			if (ref.path && ref.type !== "url") {
				itemEl.createSpan({ cls: "vc-refs-item-path", text: ref.path });
			}
		}
	}

	/**
	 * Get SVG icon by name
	 */
	private getIcon(name: string): string {
		const icons: Record<string, string> = {
			"bot": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/></svg>`,
			"scroll-text": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M15 8h-5"/><path d="M15 12h-5"/></svg>`,
			"file-text": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
			"globe": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
			"file": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`,
			"link": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
		};
		return icons[name] ?? icons["file"] ?? "";
	}

	/**
	 * Send text to TTS server for speech synthesis
	 * @param text The text to synthesize
	 * @param button The button element to show visual feedback
	 */
	private async sendToTTS(text: string, button: HTMLButtonElement): Promise<void> {
		if (!text.trim()) {
			return;
		}

		// Show loading state
		const originalIcon = button.innerHTML;
		button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="vc-spinner"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
		button.disabled = true;

		try {
			// TODO: Implement actual TTS server call
			// This is a stub - replace with actual TTS implementation
			console.log('TTS stub: Would send text to TTS server:', text.substring(0, 100) + '...');
			
			// Placeholder: simulate TTS processing
			await new Promise(resolve => setTimeout(resolve, 500));
		} catch (error) {
			console.error('TTS error:', error);
			console.error(`TTS error: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			// Restore button state
			button.innerHTML = originalIcon;
			button.disabled = false;
		}
	}
}
