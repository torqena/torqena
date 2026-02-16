/**
 * Welcome message rendering for the chat view
 */

import { setIcon } from "../../platform/utils/icons";
import { isDesktop } from "../../utils/platform";

export interface WelcomeExample {
	icon: string;
	text: string;
}

/**
 * Options for rendering the welcome message
 */
export interface WelcomeMessageOptions {
	/** Whether an AI provider is currently available */
	providerAvailable?: boolean;
	/** Callback when user clicks "Open Settings" in the provider warning */
	onOpenSettings?: () => void;
}

/**
 * Handle returned by renderWelcomeMessage to update provider warning visibility
 */
export interface WelcomeMessageHandle {
	/** Show or hide the provider warning section */
	setProviderWarningVisible(visible: boolean): void;
}

/**
 * Capabilities shown in the welcome screen
 */
export const WELCOME_CAPABILITIES: WelcomeExample[] = [
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`, 
		text: "Find and read notes across your vault" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>`, 
		text: "Draft, edit, and structure your notes" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`, 
		text: "Retrieve information from the web" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`, 
		text: "Run complex workflows on your behalf" 
	},
];

/**
 * Example questions shown in the welcome screen
 */
export const WELCOME_EXAMPLES: WelcomeExample[] = [
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`, 
		text: "Summarize this note and propose next steps" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>`, 
		text: "Create a new note in Research with this outline" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`, 
		text: "Find related notes using my corporate finance tag" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, 
		text: "Refactor this section to be more concise" 
	},
	{ 
		icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, 
		text: "Generate a monthly summary from recent notes" 
	},
];

/**
 * Render the welcome message into a container
 * @param containerEl - The container to render into
 * @param onExampleClick - Callback when an example is clicked
 * @param options - Optional configuration for provider warning display
 * @returns Handle to update provider warning visibility
 */
export function renderWelcomeMessage(
	containerEl: HTMLElement,
	onExampleClick: (text: string) => void,
	options?: WelcomeMessageOptions
): WelcomeMessageHandle {
	const welcomeEl = containerEl.createDiv({ cls: "vc-welcome" });
	
	// Logo section
	const logoEl = welcomeEl.createDiv({ cls: "vc-welcome-logo" });
	logoEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<path d="M12 8V4H8"/>
		<rect width="16" height="12" x="4" y="8" rx="2"/>
		<path d="M2 14h2"/>
		<path d="M20 14h2"/>
		<path d="M15 13v2"/>
		<path d="M9 13v2"/>
	</svg>`;
	
	// Title
	welcomeEl.createEl("h2", { text: "Ask Vault Copilot", cls: "vc-welcome-title" });
	
	// Disclaimer
	welcomeEl.createEl("p", { 
		text: "AI can make mistakes, review output carefully. Ask questions, trigger vault operations, and run skills powered by GitHub Copilot.", 
		cls: "vc-welcome-disclaimer" 
	});

	// Available capabilities section (card style)
	const capabilitiesEl = welcomeEl.createDiv({ cls: "vc-capabilities-card" });
	const capabilitiesTitle = capabilitiesEl.createEl("p", { cls: "vc-capabilities-title" });
	capabilitiesTitle.textContent = "What can the Agent do?";
	
	const capabilitiesList = capabilitiesEl.createEl("ul", { cls: "vc-capabilities-list" });
	
	for (const { icon, text } of WELCOME_CAPABILITIES) {
		const li = capabilitiesList.createEl("li", { cls: "vc-capability-item" });
		const iconSpan = li.createSpan({ cls: "vc-capability-icon" });
		iconSpan.innerHTML = icon;
		li.createSpan({ text, cls: "vc-capability-text" });
	}

	// Learn more link
	const learnMore = capabilitiesEl.createDiv({ cls: "vc-capabilities-footer" });
	const learnMoreLink = learnMore.createEl("a", { cls: "vc-capabilities-link", href: "#" });
	learnMoreLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg> Learn more about Agent Mode`;
	learnMoreLink.addEventListener("click", (e) => {
		e.preventDefault();
		window.open("https://docs.github.com/en/ai/concepts/agents/coding-agent/about-coding-agent", "_blank");
	});

	// Example questions section
	const examplesEl = welcomeEl.createDiv({ cls: "vc-examples" });
	const examplesTitle = examplesEl.createEl("p", { cls: "vc-examples-title" });
	examplesTitle.textContent = "EXAMPLE QUESTIONS";
	
	const examplesList = examplesEl.createDiv({ cls: "vc-examples-list" });
	
	for (const { icon, text } of WELCOME_EXAMPLES) {
		const btn = examplesList.createEl("button", { cls: "vc-example-btn" });
		const iconSpan = btn.createSpan({ cls: "vc-example-icon" });
		iconSpan.innerHTML = icon;
		btn.createSpan({ text, cls: "vc-example-text" });
		btn.addEventListener("click", () => onExampleClick(text));
	}

	// Provider warning section (shown when no AI provider is configured)
	const warningEl = welcomeEl.createDiv({ cls: "vc-welcome-provider-warning" });
	if (options?.providerAvailable !== false) {
		warningEl.style.display = "none";
	}
	
	const warningHeader = warningEl.createDiv({ cls: "vc-welcome-provider-warning-header" });
	const warningIcon = warningHeader.createSpan({ cls: "vc-welcome-provider-warning-icon" });
	setIcon(warningIcon, "alert-triangle");
	warningHeader.createSpan({
		cls: "vc-welcome-provider-warning-title",
		text: "No AI Provider Configured"
	});

	const warningDesc = warningEl.createDiv({ cls: "vc-welcome-provider-warning-description" });
	warningDesc.createSpan({ text: "To use chat, set up one of these:" });

	const optionsList = warningEl.createEl("ul", { cls: "vc-welcome-provider-warning-options" });
	optionsList.createEl("li", { text: "OpenAI API key" });
	optionsList.createEl("li", { text: "Azure OpenAI API key" });

	if (options?.onOpenSettings) {
		const settingsBtn = warningEl.createEl("button", {
			cls: "vc-welcome-provider-warning-btn",
			text: "Open Settings"
		});
		settingsBtn.addEventListener("click", () => options.onOpenSettings?.());
	}

	return {
		setProviderWarningVisible(visible: boolean): void {
			warningEl.style.display = visible ? "" : "none";
		}
	};
}

