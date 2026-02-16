// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module OpenAIWhisperService
 * @description Speech-to-text using OpenAI's Whisper API. Captures audio via MediaRecorder and
 * sends it to OpenAI's transcription endpoint.
 *
 * @example
 * ```typescript
 * const service = new OpenAIWhisperService({ apiKey: 'key', language: 'en' });
 * await service.initialize();
 * await service.startRecording();
 * await service.pauseRecording();
 * await service.resumeRecording();
 * const result = await service.stopRecording();
 * ```
 * @see https://platform.openai.com/docs/api-reference/audio/createTranscription
 * @since 0.0.14
 */

import OpenAI, { toFile } from 'openai';
import {
	TranscriptionResult,
	TranscriptionSegment,
} from '../types';

export interface OpenAIWhisperConfig {
	/** OpenAI API key (optional if OPENAI_API_KEY env var is set) */
	apiKey?: string;
	/** OpenAI API base URL (for custom endpoints) */
	baseURL?: string;
	/** Whisper model to use (default: whisper-1) */
	model?: string;
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

const DEFAULT_CONFIG: Required<Omit<OpenAIWhisperConfig, 'apiKey' | 'baseURL' | 'prompt' | 'audioDeviceId'>> & { prompt?: string; audioDeviceId?: string } = {
	model: 'whisper-1',
	language: 'en',
	responseFormat: 'verbose_json',
	temperature: 0,
	prompt: undefined,
	audioDeviceId: undefined,
};

/**
 * OpenAIWhisperService provides speech-to-text using OpenAI's Whisper API
 */
export class OpenAIWhisperService {
	private config: OpenAIWhisperConfig;
	private client: OpenAI | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private isRecording: boolean = false;
	private isPaused: boolean = false;
	private stream: MediaStream | null = null;
	private recordingStartTime: number = 0;

	constructor(config?: OpenAIWhisperConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if OpenAI Whisper service is supported
	 */
	async isSupported(): Promise<boolean> {
		// Check if API key is available
		const apiKey = this.getApiKey();
		if (!apiKey) {
			console.log('OpenAIWhisperService: No API key available');
			return false;
		}

		// Check MediaRecorder support
		if (typeof MediaRecorder === 'undefined') {
			console.log('OpenAIWhisperService: MediaRecorder not available');
			return false;
		}

		// Check if we can get user media
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			console.log('OpenAIWhisperService: getUserMedia not available');
			return false;
		}

		return true;
	}

	/**
	 * Test connection to OpenAI API
	 */
	async testConnection(): Promise<boolean> {
		try {
			const apiKey = this.getApiKey();
			if (!apiKey) {
				return false;
			}

			const client = new OpenAI({
				apiKey,
				baseURL: this.config.baseURL || undefined,
				dangerouslyAllowBrowser: true,
			});

			// Simple test - list models
			await client.models.list();
			return true;
		} catch (error) {
			console.log('OpenAIWhisperService: Connection test failed:', error);
			return false;
		}
	}

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure in settings.');
		}

		// Initialize OpenAI client
		this.client = new OpenAI({
			apiKey,
			baseURL: this.config.baseURL || undefined,
			dangerouslyAllowBrowser: true,
		});

		// Pre-check microphone permission
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach(track => track.stop());
			console.log('OpenAIWhisperService: Microphone access granted');
		} catch (error) {
			throw new Error(`Microphone access denied: ${error}`);
		}

		console.log('OpenAIWhisperService: Initialized');
	}

	/**
	 * Start recording audio
	 */
	async startRecording(): Promise<void> {
		if (this.isRecording) {
			throw new Error('Already recording');
		}

		if (!this.client) {
			throw new Error('Service not initialized');
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
			console.log('OpenAIWhisperService: Using MIME type:', mimeType);

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
				console.error('OpenAIWhisperService: MediaRecorder error:', event);
			};

			this.recordingStartTime = Date.now();
			this.isRecording = true;
			this.isPaused = false;

			// Start recording with timeslice
			this.mediaRecorder.start(1000);
			console.log('OpenAIWhisperService: Recording started');
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
				console.log(`OpenAIWhisperService: Recording stopped (${recordingDuration}ms)`);

				try {
					// Create blob from chunks
					const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
					const audioBlob = new Blob(this.audioChunks, { type: mimeType });
					console.log(`OpenAIWhisperService: Audio blob size: ${audioBlob.size} bytes`);

					// Cleanup recording resources
					this.cleanup();

					// Send to OpenAI API
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
		console.log('OpenAIWhisperService: Recording cancelled');
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
		console.log('OpenAIWhisperService: Recording paused');
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
		console.log('OpenAIWhisperService: Recording resumed');
	}

	/**
	 * Send audio to OpenAI for transcription
	 */
	private async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
		if (!this.client) {
			throw new Error('OpenAI client not initialized');
		}

		const transcribeStart = Date.now();

		try {
			// Convert blob to File object for OpenAI SDK
			const filename = this.getFilenameForMimeType(audioBlob.type);
			const file = await toFile(audioBlob, filename);

			// Build transcription options
			const options: OpenAI.Audio.TranscriptionCreateParams = {
				file,
				model: this.config.model || 'whisper-1',
				response_format: this.config.responseFormat || 'verbose_json',
			};

			// Add optional parameters
			if (this.config.language && this.config.language !== 'auto') {
				options.language = this.config.language;
			}
			if (this.config.prompt) {
				options.prompt = this.config.prompt;
			}
			if (this.config.temperature !== undefined) {
				options.temperature = this.config.temperature;
			}

			console.log('OpenAIWhisperService: Sending audio to OpenAI...');

			// Call OpenAI transcription API
			const response = await this.client.audio.transcriptions.create(options);
			const transcribeDurationMs = Date.now() - transcribeStart;

			console.log(`OpenAIWhisperService: Transcription completed in ${transcribeDurationMs}ms`);

			// Parse response based on format
			return this.parseResponse(response, transcribeDurationMs);
		} catch (error) {
			if (error instanceof OpenAI.APIError) {
				throw new Error(`OpenAI API error (${error.status}): ${error.message}`);
			}
			throw new Error(`Transcription failed: ${error}`);
		}
	}

	/**
	 * Parse OpenAI transcription response
	 */
	private parseResponse(
		response: OpenAI.Audio.Transcription,
		transcribeDurationMs: number
	): TranscriptionResult {
		// Handle different response formats
		// verbose_json includes segments, other formats just have text
		const text = typeof response === 'string' ? response : response.text;
		const segments: TranscriptionSegment[] = [];

		// Check if response has segments (verbose_json format)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const rawResponse = response as any;
		if (rawResponse.segments && Array.isArray(rawResponse.segments)) {
			for (const seg of rawResponse.segments) {
				segments.push({
					text: seg.text?.trim() || '',
					timeStart: (seg.start || 0) * 1000, // Convert to ms
					timeEnd: (seg.end || 0) * 1000,
				});
			}
		}

		console.log(`OpenAIWhisperService: Text: "${text}"`);

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
		// OpenAI supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
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
	updateConfig(config: Partial<OpenAIWhisperConfig>): void {
		this.config = { ...this.config, ...config };
		
		// Reinitialize client if API key or baseURL changed
		if ((config.apiKey || config.baseURL) && this.client) {
			const apiKey = this.getApiKey();
			if (apiKey) {
				this.client = new OpenAI({
					apiKey,
					baseURL: this.config.baseURL || undefined,
					dangerouslyAllowBrowser: true,
				});
			}
		}
	}

	/**
	 * Get current language
	 */
	getLanguage(): string {
		return this.config.language || 'en';
	}

	private getApiKey(): string | undefined {
		if (this.config.apiKey) {
			return this.config.apiKey;
		}
		if (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) {
			return process.env.OPENAI_API_KEY;
		}
		return undefined;
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
		this.client = null;
	}
}
