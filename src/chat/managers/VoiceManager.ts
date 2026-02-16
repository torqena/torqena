/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module VoiceManager
 * @description Manages voice input (Whisper-based transcription) for the chat view.
 * Handles recording state, voice button UI, and transcription lifecycle.
 *
 * @see {@link CopilotChatView} for integration
 * @see {@link VoiceChatService} for voice transcription service
 * @since 0.0.20
 */

import { VoiceChatService, RecordingState } from "../../ai/voice-chat";

/**
 * Callbacks for voice manager events
 */
export interface VoiceManagerCallbacks {
	/** Called when transcription produces text */
	onTranscription: (text: string) => void;
}

/**
 * Manages voice input recording and transcription UI
 */
export class VoiceManager {
	private voiceChatService: VoiceChatService;
	private callbacks: VoiceManagerCallbacks;

	private voiceBtn: HTMLButtonElement | null = null;
	private voiceStopBtn: HTMLButtonElement | null = null;
	private voiceStateUnsubscribe: (() => void) | null = null;

	constructor(voiceChatService: VoiceChatService, callbacks: VoiceManagerCallbacks) {
		this.voiceChatService = voiceChatService;
		this.callbacks = callbacks;
	}

	/**
	 * Create voice toolbar buttons in the given container.
	 * @param toolbarRightEl - The toolbar container to append buttons to
	 */
	createButtons(toolbarRightEl: HTMLDivElement): void {
		this.voiceBtn = toolbarRightEl.createEl("button", {
			cls: "vc-toolbar-btn vc-voice-btn",
			attr: { "aria-label": "Voice input" }
		});
		this.updateButtonState('idle');
		this.voiceBtn.addEventListener("click", () => this.handleVoiceInput());

		this.voiceStopBtn = toolbarRightEl.createEl("button", {
			cls: "vc-toolbar-btn vc-voice-stop-btn",
			attr: { "aria-label": "Stop recording and transcribe" }
		});
		this.voiceStopBtn.style.display = "none";
		this.voiceStopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`;
		this.voiceStopBtn.addEventListener("click", () => this.handleVoiceStop());

		// Subscribe to voice chat state changes
		this.voiceStateUnsubscribe = this.voiceChatService.on('stateChange', (state) => {
			this.updateButtonState(state);
		});
	}

	/**
	 * Remove voice buttons from the DOM and clean up subscriptions
	 */
	removeButtons(): void {
		if (this.voiceStateUnsubscribe) {
			this.voiceStateUnsubscribe();
			this.voiceStateUnsubscribe = null;
		}
		if (this.voiceBtn) {
			this.voiceBtn.remove();
			this.voiceBtn = null;
		}
		if (this.voiceStopBtn) {
			this.voiceStopBtn.remove();
			this.voiceStopBtn = null;
		}
	}

	/**
	 * Show or hide the voice button (e.g., while realtime agent is active)
	 */
	setVisible(visible: boolean): void {
		if (this.voiceBtn) {
			this.voiceBtn.style.display = visible ? '' : 'none';
		}
	}

	/**
	 * Handle voice input button click
	 */
	private async handleVoiceInput(): Promise<void> {
		const state = this.voiceChatService.getState();
		console.log('VoiceInput: Current state:', state);

		try {
			switch (state) {
				case 'recording':
					await this.voiceChatService.pauseRecording();
					break;
				case 'paused':
					await this.voiceChatService.resumeRecording();
					break;
				case 'idle':
				case 'error':
					await this.voiceChatService.startRecording();
					break;
				case 'processing':
				default:
					break;
			}
		} catch (error) {
			console.error('Voice input action failed:', error);
		}
	}

	/**
	 * Stop recording and transcribe the captured audio
	 */
	private async handleVoiceStop(): Promise<void> {
		const state = this.voiceChatService.getState();
		if (state !== 'recording' && state !== 'paused') {
			console.log('VoiceStop: Ignoring stop, not currently recording');
			return;
		}

		try {
			const result = await this.voiceChatService.stopRecording();
			console.log('VoiceStop: Got result:', result);
			if (result.text) {
				this.callbacks.onTranscription(result.text);
			} else {
				console.log('VoiceStop: No text in result');
			}
		} catch (error) {
			console.error('Voice transcription failed:', error);
		}
	}

	/**
	 * Update the voice button visual state based on recording state
	 */
	private updateButtonState(state: RecordingState): void {
		if (!this.voiceBtn) return;

		this.voiceBtn.removeClass('vc-voice-recording', 'vc-voice-processing', 'vc-voice-error', 'vc-voice-paused');

		switch (state) {
			case 'recording':
				this.voiceBtn.addClass('vc-voice-recording');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Pause recording');
				break;
			case 'paused':
				this.voiceBtn.addClass('vc-voice-paused');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Resume recording');
				break;
			case 'processing':
				this.voiceBtn.addClass('vc-voice-processing');
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="m4.93 4.93 2.83 2.83"></path><path d="m16.24 16.24 2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="m4.93 19.07 2.83-2.83"></path><path d="m16.24 7.76 2.83-2.83"></path></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Processing...');
				break;
			case 'error':
				this.voiceBtn.addClass('vc-voice-error');
				// Fall through to idle icon
			case 'idle':
			default:
				this.voiceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`;
				this.voiceBtn.setAttribute('aria-label', 'Voice input');
				break;
		}

		if (this.voiceStopBtn) {
			const showStop = state === 'recording' || state === 'paused' || state === 'processing';
			this.voiceStopBtn.style.display = showStop ? '' : 'none';
			this.voiceStopBtn.disabled = state === 'processing';
		}
	}

	/**
	 * Clean up all resources
	 */
	destroy(): void {
		this.removeButtons();
		if (this.voiceChatService) {
			this.voiceChatService.destroy();
		}
	}
}
