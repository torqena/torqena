// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module AzureWhisperService
 * @description Speech-to-text using Azure OpenAI's Whisper API. Captures audio with MediaRecorder
 * and uploads to the configured Azure deployment.
 *
 * @example
 * ```typescript
 * const service = new AzureWhisperService({ endpoint: 'https://example.openai.azure.com', deploymentName: 'whisper' });
 * await service.initialize();
 * await service.startRecording();
 * await service.pauseRecording();
 * await service.resumeRecording();
 * const result = await service.stopRecording();
 * ```
 * @see https://learn.microsoft.com/en-us/azure/ai-services/openai/whisper-quickstart
 * @since 0.0.14
 */

import {
	TranscriptionResult,
	TranscriptionSegment,
} from '../types';

export interface AzureWhisperConfig {
	/** Azure OpenAI API key (optional if AZURE_OPENAI_KEY env var is set) */
	apiKey?: string;
	/** Azure OpenAI endpoint (e.g., https://your-resource.openai.azure.com) */
	endpoint?: string;
	/** Azure OpenAI deployment name for Whisper model */
	deploymentName?: string;
	/** API version (default: 2024-06-01) */
	apiVersion?: string;
	/** Language code for transcription (e.g., 'en', 'es', 'auto') */
	language?: string;
	/** Optional prompt to guide the model */
	prompt?: string;
	/** Response format: json, text, srt, verbose_json, vtt */
	responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
	/** Temperature for sampling (0-1) */
	temperature?: number;
	/** Audio input device ID (optional, uses default if not specified) */
	audioDeviceId?: string;
}

const DEFAULT_CONFIG: Required<Omit<AzureWhisperConfig, 'apiKey' | 'endpoint' | 'deploymentName' | 'prompt' | 'audioDeviceId'>> & { prompt?: string; audioDeviceId?: string } = {
	apiVersion: '2024-06-01',
	language: 'en',
	responseFormat: 'verbose_json',
	temperature: 0,
	prompt: undefined,
	audioDeviceId: undefined,
};

/**
 * Get API key from environment or config
 */
export function getAzureOpenAIApiKey(configKey?: string): string | undefined {
	// First check config
	if (configKey) {
		return configKey;
	}
	
	// Then check environment variables
	if (typeof process !== "undefined" && process.env) {
		return process.env.AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_API_KEY;
	}
	
	return undefined;
}

/**
 * AzureWhisperService provides speech-to-text using Azure OpenAI's Whisper API
 */
export class AzureWhisperService {
	private config: AzureWhisperConfig;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private isRecording: boolean = false;
	private isPaused: boolean = false;
	private stream: MediaStream | null = null;
	private recordingStartTime: number = 0;

	constructor(config?: AzureWhisperConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if Azure Whisper service is supported
	 */
	async isSupported(): Promise<boolean> {
		// Check if API key is available
		const apiKey = getAzureOpenAIApiKey(this.config.apiKey);
		if (!apiKey) {
			console.log('AzureWhisperService: No API key available');
			return false;
		}

		// Check if endpoint is configured
		if (!this.config.endpoint) {
			console.log('AzureWhisperService: No endpoint configured');
			return false;
		}

		// Check if deployment name is configured
		if (!this.config.deploymentName) {
			console.log('AzureWhisperService: No deployment name configured');
			return false;
		}

		// Check MediaRecorder support
		if (typeof MediaRecorder === 'undefined') {
			console.log('AzureWhisperService: MediaRecorder not available');
			return false;
		}

		// Check if we can get user media
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			console.log('AzureWhisperService: getUserMedia not available');
			return false;
		}

		return true;
	}

	/**
	 * Test connection to Azure OpenAI API
	 */
	async testConnection(): Promise<{ success: boolean; error?: string }> {
		try {
			const apiKey = getAzureOpenAIApiKey(this.config.apiKey);
			if (!apiKey) {
				return { success: false, error: 'No API key configured' };
			}

			if (!this.config.endpoint) {
				return { success: false, error: 'No endpoint configured' };
			}

			if (!this.config.deploymentName) {
				return { success: false, error: 'No deployment name configured' };
			}

			// Simple test - try to reach the endpoint
			const url = new URL(this.config.endpoint);
			const response = await fetch(`${url.origin}/openai/models?api-version=${this.config.apiVersion || DEFAULT_CONFIG.apiVersion}`, {
				method: 'GET',
				headers: {
					'api-key': apiKey,
				},
			});

			if (response.ok) {
				return { success: true };
			} else {
				const errorText = await response.text();
				return { success: false, error: `HTTP ${response.status}: ${errorText}` };
			}
		} catch (error) {
			console.log('AzureWhisperService: Connection test failed:', error);
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		const apiKey = getAzureOpenAIApiKey(this.config.apiKey);
		if (!apiKey) {
			throw new Error('Azure OpenAI API key not configured. Set AZURE_OPENAI_KEY environment variable or configure in settings.');
		}

		if (!this.config.endpoint) {
			throw new Error('Azure OpenAI endpoint not configured.');
		}

		if (!this.config.deploymentName) {
			throw new Error('Azure OpenAI deployment name not configured.');
		}

		// Pre-check microphone permission
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach(track => track.stop());
			console.log('AzureWhisperService: Microphone access granted');
		} catch (error) {
			throw new Error(`Microphone access denied: ${error}`);
		}

		console.log('AzureWhisperService: Initialized');
	}

	/**
	 * Start recording audio
	 */
	async startRecording(): Promise<void> {
		if (this.isRecording) {
			throw new Error('Already recording');
		}

		try {
			// Build audio constraints with optional device selection
			const audioConstraints: MediaTrackConstraints = {
				channelCount: 1,
				sampleRate: 16000,
				echoCancellation: true,
				noiseSuppression: true,
			};
			if (this.config.audioDeviceId) {
				audioConstraints.deviceId = { exact: this.config.audioDeviceId };
			}

			// Get microphone stream
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: audioConstraints,
			});

			// Determine best audio format
			const mimeType = this.getSupportedMimeType();
			console.log('AzureWhisperService: Using MIME type:', mimeType);

			this.audioChunks = [];
			this.mediaRecorder = new MediaRecorder(this.stream, {
				mimeType: mimeType,
			});

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
				}
			};

			this.mediaRecorder.onerror = (event) => {
				console.error('AzureWhisperService: MediaRecorder error:', event);
			};

			this.recordingStartTime = Date.now();
			this.isRecording = true;
			this.isPaused = false;

			// Start recording with timeslice
			this.mediaRecorder.start(1000);
			console.log('AzureWhisperService: Recording started');
		} catch (error) {
			this.cleanup();
			throw new Error(`Failed to start recording: ${error}`);
		}
	}

	/**
	 * Stop recording and transcribe the audio
	 */
	async stopRecording(): Promise<TranscriptionResult> {
		if (!this.isRecording || !this.mediaRecorder) {
			throw new Error('Not recording');
		}

		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder) {
				reject(new Error('MediaRecorder not initialized'));
				return;
			}

			this.mediaRecorder.onstop = async () => {
				const recordingDuration = Date.now() - this.recordingStartTime;
				console.log(`AzureWhisperService: Recording stopped (${recordingDuration}ms)`);

				try {
					// Create blob from chunks
					const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
					const audioBlob = new Blob(this.audioChunks, { type: mimeType });
					console.log(`AzureWhisperService: Audio blob size: ${audioBlob.size} bytes`);

					// Cleanup recording resources
					this.cleanup();

					// Send to Azure OpenAI API
					const result = await this.transcribe(audioBlob);
					resolve(result);
				} catch (error) {
					this.cleanup();
					reject(error);
				}
			};

			this.mediaRecorder.stop();
			this.isRecording = false;
			this.isPaused = false;
		});
	}

	/**
	 * Cancel recording without transcription
	 */
	cancelRecording(): void {
		if (this.mediaRecorder && this.isRecording) {
			this.mediaRecorder.stop();
		}
		this.cleanup();
		console.log('AzureWhisperService: Recording cancelled');
	}

	/**
	 * Pause recording without ending the session
	 */
	async pauseRecording(): Promise<void> {
		if (!this.mediaRecorder || !this.isRecording || this.isPaused) {
			throw new Error('Cannot pause when not recording');
		}
		this.mediaRecorder.pause();
		this.isPaused = true;
		console.log('AzureWhisperService: Recording paused');
	}

	/**
	 * Resume a paused recording
	 */
	async resumeRecording(): Promise<void> {
		if (!this.mediaRecorder || !this.isRecording || !this.isPaused) {
			throw new Error('Cannot resume when not paused');
		}
		this.mediaRecorder.resume();
		this.isPaused = false;
		console.log('AzureWhisperService: Recording resumed');
	}

	/**
	 * Send audio to Azure OpenAI for transcription
	 */
	private async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
		const transcribeStart = Date.now();

		const apiKey = getAzureOpenAIApiKey(this.config.apiKey);
		if (!apiKey) {
			throw new Error('Azure OpenAI API key not available');
		}

		try {
			// Build the Azure OpenAI transcription URL
			// Format: https://{endpoint}/openai/deployments/{deployment}/audio/transcriptions?api-version={version}
			const endpoint = this.config.endpoint!.replace(/\/$/, ''); // Remove trailing slash
			const apiVersion = this.config.apiVersion || DEFAULT_CONFIG.apiVersion;
			const url = `${endpoint}/openai/deployments/${this.config.deploymentName}/audio/transcriptions?api-version=${apiVersion}`;

			// Create form data
			const formData = new FormData();
			const filename = this.getFilenameForMimeType(audioBlob.type);
			formData.append('file', audioBlob, filename);

			// Add optional parameters
			if (this.config.language && this.config.language !== 'auto') {
				formData.append('language', this.config.language);
			}
			if (this.config.prompt) {
				formData.append('prompt', this.config.prompt);
			}
			if (this.config.temperature !== undefined) {
				formData.append('temperature', String(this.config.temperature));
			}
			if (this.config.responseFormat) {
				formData.append('response_format', this.config.responseFormat);
			}

			console.log('AzureWhisperService: Sending audio to Azure OpenAI...');

			// Call Azure OpenAI transcription API
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'api-key': apiKey,
				},
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Azure API error (${response.status}): ${errorText}`);
			}

			const result = await response.json();
			const transcribeDurationMs = Date.now() - transcribeStart;

			console.log(`AzureWhisperService: Transcription completed in ${transcribeDurationMs}ms`);

			// Parse response
			return this.parseResponse(result, transcribeDurationMs);
		} catch (error) {
			throw new Error(`Transcription failed: ${error}`);
		}
	}

	/**
	 * Parse Azure OpenAI transcription response
	 */
	private parseResponse(
		response: Record<string, unknown>,
		transcribeDurationMs: number
	): TranscriptionResult {
		// Handle different response formats
		const text = typeof response.text === 'string' ? response.text : '';
		const segments: TranscriptionSegment[] = [];

		// Check if response has segments (verbose_json format)
		if (response.segments && Array.isArray(response.segments)) {
			for (const seg of response.segments as Array<{ text?: string; start?: number; end?: number }>) {
				segments.push({
					text: seg.text?.trim() || '',
					timeStart: (seg.start || 0) * 1000, // Convert to ms
					timeEnd: (seg.end || 0) * 1000,
				});
			}
		}

		console.log(`AzureWhisperService: Text: "${text}"`);

		return {
			text: text.trim(),
			segments,
			transcribeDurationMs,
		};
	}

	/**
	 * Get a supported MIME type for MediaRecorder
	 */
	private getSupportedMimeType(): string {
		// Azure OpenAI supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
		const types = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/mp4',
			'audio/ogg;codecs=opus',
			'audio/ogg',
			'audio/wav',
		];

		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}

		return ''; // Let the browser choose
	}

	/**
	 * Get appropriate filename extension for MIME type
	 */
	private getFilenameForMimeType(mimeType: string): string {
		if (mimeType.includes('webm')) return 'audio.webm';
		if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.mp4';
		if (mimeType.includes('ogg')) return 'audio.ogg';
		if (mimeType.includes('wav')) return 'audio.wav';
		return 'audio.webm'; // Default
	}

	/**
	 * Check if currently recording
	 */
	getIsRecording(): boolean {
		return this.isRecording;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AzureWhisperConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current language
	 */
	getLanguage(): string {
		return this.config.language || 'en';
	}

	/**
	 * Clean up recording resources
	 */
	private cleanup(): void {
		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
			this.stream = null;
		}
		this.mediaRecorder = null;
		this.audioChunks = [];
		this.isRecording = false;
		this.isPaused = false;
	}

	/**
	 * Destroy the service
	 */
	destroy(): void {
		this.cancelRecording();
	}
}
