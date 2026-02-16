// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module VoiceChatService
 * @description Main service for voice recording and transcription.
 *
 * Coordinates multiple backends:
 * - local-whisper: Uses MediaRecorder + local whisper.cpp server
 * - openai-whisper: Uses MediaRecorder + OpenAI Whisper API (recommended)
 * - azure-whisper: Uses MediaRecorder + Azure OpenAI Whisper API
 *
 * @example
 * ```typescript
 * const service = new VoiceChatService({ backend: 'openai-whisper' });
 * await service.startRecording();
 * await service.pauseRecording();
 * await service.resumeRecording();
 * const transcript = await service.stopRecording();
 * ```
 * @since 0.0.14
 */

import { LocalWhisperService } from './whisper/LocalWhisperService';
import { OpenAIWhisperService } from './whisper/OpenAIWhisperService';
import { AzureWhisperService } from './whisper/AzureWhisperService';
import {
	RecordingState,
	TranscriptionResult,
	TranscriptionSegment,
	VoiceChatEvents,
} from './types';

export type VoiceBackend = 'local-whisper' | 'openai-whisper' | 'azure-whisper';

export interface VoiceChatServiceConfig {
	/** Voice backend to use */
	backend?: VoiceBackend;
	/** Language code for speech recognition (e.g., 'en-US', 'es-ES', 'en') */
	language?: string;
	/** URL of the local whisper server (for local-whisper backend) */
	whisperServerUrl?: string;
	/** OpenAI API key (for openai-whisper backend) */
	openaiApiKey?: string;
	/** OpenAI base URL (for openai-whisper backend) */
	openaiBaseUrl?: string;
	/** Azure OpenAI API key (for azure-whisper backend) */
	azureApiKey?: string;
	/** Azure OpenAI endpoint (for azure-whisper backend) */
	azureEndpoint?: string;
	/** Azure OpenAI deployment name (for azure-whisper backend) */
	azureDeploymentName?: string;
	/** Azure OpenAI API version (for azure-whisper backend) */
	azureApiVersion?: string;
	/** Audio input device ID (optional, uses default if not specified) */
	audioDeviceId?: string;
}

const DEFAULT_CONFIG: VoiceChatServiceConfig = {
	backend: 'openai-whisper',
	language: 'en-US',
	whisperServerUrl: 'http://127.0.0.1:8080',
	openaiApiKey: undefined,
	openaiBaseUrl: undefined,
	azureApiKey: undefined,
	azureEndpoint: undefined,
	azureDeploymentName: undefined,
	azureApiVersion: undefined,
	audioDeviceId: undefined,
};

/**
 * VoiceChatService provides a unified interface for voice-to-text
 */
export class VoiceChatService {
	private config: VoiceChatServiceConfig;
	private localWhisper: LocalWhisperService | null = null;
	private openaiWhisper: OpenAIWhisperService | null = null;
	private azureWhisper: AzureWhisperService | null = null;
	private activeBackend: VoiceBackend | null = null;
	private state: RecordingState = 'idle';
	private isInitialized: boolean = false;
	private listeners: Map<keyof VoiceChatEvents, Set<(...args: unknown[]) => void>> = new Map();

	constructor(config?: VoiceChatServiceConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if voice chat is supported
	 */
	async isSupported(): Promise<boolean> {
		// Check OpenAI whisper first (preferred)
		if (this.config.backend === 'openai-whisper') {
			const openaiWhisper = new OpenAIWhisperService({
				apiKey: this.config.openaiApiKey,
				baseURL: this.config.openaiBaseUrl,
				language: this.config.language?.split('-')[0] || 'en',
			});
			if (await openaiWhisper.isSupported()) {
				return true;
			}
		}

		// Check Azure whisper
		if (this.config.backend === 'azure-whisper') {
			const azureWhisper = new AzureWhisperService({
				apiKey: this.config.azureApiKey,
				endpoint: this.config.azureEndpoint,
				deploymentName: this.config.azureDeploymentName,
				apiVersion: this.config.azureApiVersion,
				language: this.config.language?.split('-')[0] || 'en',
			});
			if (await azureWhisper.isSupported()) {
				return true;
			}
		}

		// Check local whisper
		if (this.config.backend === 'local-whisper') {
			const localWhisper = new LocalWhisperService({
				serverUrl: this.config.whisperServerUrl,
				language: this.config.language?.split('-')[0] || 'en',
			});
			if (await localWhisper.isSupported()) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		// Try OpenAI whisper first (preferred)
		if (this.config.backend === 'openai-whisper') {
			try {
				this.openaiWhisper = new OpenAIWhisperService({
					apiKey: this.config.openaiApiKey,
					baseURL: this.config.openaiBaseUrl,
					language: this.config.language?.split('-')[0] || 'en',
					audioDeviceId: this.config.audioDeviceId,
				});
				
				if (await this.openaiWhisper.isSupported()) {
					await this.openaiWhisper.initialize();
					this.activeBackend = 'openai-whisper';
					this.isInitialized = true;
					console.log('VoiceChatService: Initialized with openai-whisper backend');
					return;
				} else {
					console.log('VoiceChatService: OpenAI Whisper not available, falling back');
				}
			} catch (error) {
				console.log('VoiceChatService: OpenAI Whisper init failed, falling back:', error);
			}
		}

		// Try Azure whisper
		if (this.config.backend === 'azure-whisper') {
			try {
				this.azureWhisper = new AzureWhisperService({
					apiKey: this.config.azureApiKey,
					endpoint: this.config.azureEndpoint,
					deploymentName: this.config.azureDeploymentName,
					apiVersion: this.config.azureApiVersion,
					language: this.config.language?.split('-')[0] || 'en',
					audioDeviceId: this.config.audioDeviceId,
				});
				
				if (await this.azureWhisper.isSupported()) {
					await this.azureWhisper.initialize();
					this.activeBackend = 'azure-whisper';
					this.isInitialized = true;
					console.log('VoiceChatService: Initialized with azure-whisper backend');
					return;
				} else {
					console.log('VoiceChatService: Azure Whisper not available, falling back');
				}
			} catch (error) {
				console.log('VoiceChatService: Azure Whisper init failed, falling back:', error);
			}
		}

		// Try local whisper
		if (this.config.backend === 'local-whisper' || this.config.backend === 'openai-whisper' || this.config.backend === 'azure-whisper') {
			try {
				this.localWhisper = new LocalWhisperService({
					serverUrl: this.config.whisperServerUrl,
					language: this.config.language?.split('-')[0] || 'en',
					audioDeviceId: this.config.audioDeviceId,
				});
				
				if (await this.localWhisper.isSupported()) {
					// Check if server is reachable
					const serverOk = await this.localWhisper.checkServerConnection();
					if (serverOk) {
						await this.localWhisper.initialize();
						this.activeBackend = 'local-whisper';
						this.isInitialized = true;
						console.log('VoiceChatService: Initialized with local-whisper backend');
						return;
					} else {
						console.log('VoiceChatService: Local whisper server not reachable');
					}
				}
			} catch (error) {
				console.log('VoiceChatService: Local whisper init failed:', error);
			}
		}

		throw new Error('No voice backend available. Configure OpenAI API key, Azure OpenAI settings, or ensure whisper.cpp server is running.');
	}

	/**
	 * Get the active backend
	 */
	getActiveBackend(): VoiceBackend | null {
		return this.activeBackend;
	}

	/**
	 * Check if local whisper server is connected
	 */
	async checkLocalWhisperServer(): Promise<boolean> {
		if (this.localWhisper) {
			return await this.localWhisper.checkServerConnection();
		}
		const temp = new LocalWhisperService({
			serverUrl: this.config.whisperServerUrl,
		});
		return await temp.checkServerConnection();
	}

	/**
	 * Start recording
	 */
	async startRecording(): Promise<void> {
		if (this.state === 'recording') {
			return;
		}
		if (this.state === 'paused') {
			await this.resumeRecording();
			return;
		}

		try {
			// Initialize if not already done
			if (!this.isInitialized) {
				await this.initialize();
			}

			this.setState('recording');
			console.log(`VoiceChatService: Recording started (backend: ${this.activeBackend})`);

			if (this.activeBackend === 'openai-whisper' && this.openaiWhisper) {
				// OpenAI whisper: just start recording, transcription happens on stop
				await this.openaiWhisper.startRecording();
			} else if (this.activeBackend === 'azure-whisper' && this.azureWhisper) {
				// Azure whisper: just start recording, transcription happens on stop
				await this.azureWhisper.startRecording();

			} else if (this.activeBackend === 'local-whisper' && this.localWhisper) {
				// Local whisper: just start recording, transcription happens on stop
				await this.localWhisper.startRecording();
			}
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Stop recording and transcribe
	 */
	async stopRecording(): Promise<TranscriptionResult> {
		if (this.state !== 'recording' && this.state !== 'paused') {
			throw new Error('Not recording');
		}

		try {
			this.setState('processing');
			console.log('VoiceChatService: Stopping recording...');

			let result: TranscriptionResult = { text: '', segments: [], transcribeDurationMs: 0 };

			if (this.activeBackend === 'openai-whisper' && this.openaiWhisper) {
				// OpenAI whisper: stop recording and transcribe via API
				result = await this.openaiWhisper.stopRecording();
			} else if (this.activeBackend === 'azure-whisper' && this.azureWhisper) {
				// Azure whisper: stop recording and transcribe via API
				result = await this.azureWhisper.stopRecording();
			} else if (this.activeBackend === 'local-whisper' && this.localWhisper) {
				// Local whisper: stop recording and transcribe via server
				result = await this.localWhisper.stopRecording();
			}

			this.setState('idle');
			console.log('VoiceChatService: Transcription result:', result.text);

			return result;
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Pause recording without ending the session
	 */
	async pauseRecording(): Promise<void> {
		if (this.state !== 'recording') {
			throw new Error('Cannot pause when not recording');
		}

		try {
			if (this.activeBackend === 'openai-whisper' && this.openaiWhisper) {
				await this.openaiWhisper.pauseRecording();
			} else if (this.activeBackend === 'azure-whisper' && this.azureWhisper) {
				await this.azureWhisper.pauseRecording();
			} else if (this.activeBackend === 'local-whisper' && this.localWhisper) {
				await this.localWhisper.pauseRecording();
			}

			this.setState('paused');
			console.log('VoiceChatService: Recording paused');
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Resume a previously paused recording
	 */
	async resumeRecording(): Promise<void> {
		if (this.state !== 'paused') {
			throw new Error('Cannot resume when not paused');
		}

		try {
			if (this.activeBackend === 'openai-whisper' && this.openaiWhisper) {
				await this.openaiWhisper.resumeRecording();
			} else if (this.activeBackend === 'azure-whisper' && this.azureWhisper) {
				await this.azureWhisper.resumeRecording();
			} else if (this.activeBackend === 'local-whisper' && this.localWhisper) {
				await this.localWhisper.resumeRecording();
			}

			this.setState('recording');
			console.log('VoiceChatService: Recording resumed');
		} catch (error) {
			this.setState('error');
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}

	/**
	 * Cancel recording without transcription
	 */
	cancelRecording(): void {
		if (this.activeBackend === 'openai-whisper' && this.openaiWhisper) {
			this.openaiWhisper.cancelRecording();
		} else if (this.activeBackend === 'azure-whisper' && this.azureWhisper) {
			this.azureWhisper.cancelRecording();
		} else if (this.activeBackend === 'local-whisper' && this.localWhisper) {
			this.localWhisper.cancelRecording();
		}
		this.setState('idle');
		console.log('VoiceChatService: Recording cancelled');
	}

	/**
	 * Toggle recording (convenience method)
	 */
	async toggleRecording(): Promise<TranscriptionResult | null> {
		if (this.state === 'recording') {
			return await this.stopRecording();
		} else if (this.state === 'paused') {
			await this.resumeRecording();
			return null;
		} else if (this.state === 'idle') {
			await this.startRecording();
			return null;
		}
		return null;
	}

	/**
	 * Get current state
	 */
	getState(): RecordingState {
		return this.state;
	}

	/**
	 * Check if initialized
	 */
	getIsInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * Update language setting
	 */
	setLanguage(language: string): void {
		this.config.language = language;
		if (this.localWhisper) {
			this.localWhisper.updateConfig({ language: language.split('-')[0] });
		}
		if (this.openaiWhisper) {
			this.openaiWhisper.updateConfig({ language: language.split('-')[0] });
		}
		if (this.azureWhisper) {
			this.azureWhisper.updateConfig({ language: language.split('-')[0] });
		}
	}

	/**
	 * Update whisper server URL
	 */
	setWhisperServerUrl(url: string): void {
		this.config.whisperServerUrl = url;
		if (this.localWhisper) {
			this.localWhisper.updateConfig({ serverUrl: url });
		}
	}

	/**
	 * Get current whisper server URL
	 */
	getWhisperServerUrl(): string {
		return this.config.whisperServerUrl || DEFAULT_CONFIG.whisperServerUrl!;
	}

	/**
	 * Update OpenAI settings
	 */
	setOpenAIConfig(apiKey?: string, baseUrl?: string): void {
		this.config.openaiApiKey = apiKey;
		this.config.openaiBaseUrl = baseUrl;
		if (this.openaiWhisper) {
			this.openaiWhisper.updateConfig({ apiKey, baseURL: baseUrl });
		}
	}

	/**
	 * Check if OpenAI Whisper is available
	 */
	async checkOpenAIWhisper(): Promise<boolean> {
		const openaiWhisper = new OpenAIWhisperService({
			apiKey: this.config.openaiApiKey,
			baseURL: this.config.openaiBaseUrl,
		});
		return await openaiWhisper.isSupported();
	}

	/**
	 * Update Azure OpenAI settings
	 */
	setAzureConfig(apiKey?: string, endpoint?: string, deploymentName?: string, apiVersion?: string): void {
		this.config.azureApiKey = apiKey;
		this.config.azureEndpoint = endpoint;
		this.config.azureDeploymentName = deploymentName;
		this.config.azureApiVersion = apiVersion;
		if (this.azureWhisper) {
			this.azureWhisper.updateConfig({ apiKey, endpoint, deploymentName, apiVersion });
		}
	}

	/**
	 * Check if Azure Whisper is available
	 */
	async checkAzureWhisper(): Promise<boolean> {
		const azureWhisper = new AzureWhisperService({
			apiKey: this.config.azureApiKey,
			endpoint: this.config.azureEndpoint,
			deploymentName: this.config.azureDeploymentName,
			apiVersion: this.config.azureApiVersion,
		});
		return await azureWhisper.isSupported();
	}

	/**
	 * Subscribe to events
	 */
	on<K extends keyof VoiceChatEvents>(event: K, callback: VoiceChatEvents[K]): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback as (...args: unknown[]) => void);

		// Return unsubscribe function
		return () => {
			this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
		};
	}

	private emit<K extends keyof VoiceChatEvents>(event: K, ...args: Parameters<VoiceChatEvents[K]>): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			for (const callback of callbacks) {
				try {
					callback(...args);
				} catch (error) {
					console.error(`VoiceChatService: Error in ${event} listener:`, error);
				}
			}
		}
	}

	private setState(newState: RecordingState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.emit('stateChange', newState);
		}
	}

	/**
	 * Destroy the service
	 */
	destroy(): void {
		if (this.localWhisper) {
			this.localWhisper.destroy();
			this.localWhisper = null;
		}
		if (this.openaiWhisper) {
			this.openaiWhisper.destroy();
			this.openaiWhisper = null;
		}
		if (this.azureWhisper) {
			this.azureWhisper.destroy();
			this.azureWhisper = null;
		}
		this.listeners.clear();
		this.isInitialized = false;
		this.activeBackend = null;
		this.state = 'idle';
	}
}
