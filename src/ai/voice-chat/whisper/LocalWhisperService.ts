// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module LocalWhisperService
 * @description Speech-to-text using a local whisper.cpp-compatible server. Captures audio with
 * MediaRecorder and posts it to a local REST API.
 *
 * @example
 * ```typescript
 * const service = new LocalWhisperService({ serverUrl: 'http://127.0.0.1:8080' });
 * await service.initialize();
 * await service.startRecording();
 * await service.pauseRecording();
 * await service.resumeRecording();
 * const result = await service.stopRecording();
 * ```
 * @see https://github.com/ggerganov/whisper.cpp/tree/master/examples/server
 * @see https://github.com/fedirz/faster-whisper-server
 * @since 0.0.14
 */

import {
	TranscriptionResult,
	TranscriptionSegment,
} from '../types';

export interface LocalWhisperConfig {
	/** URL of the local whisper server (default: http://127.0.0.1:8080) */
	serverUrl?: string;
	/** Language code for transcription (e.g., 'en', 'es', 'auto') */
	language?: string;
	/** Audio sample rate in Hz (default: 16000 for whisper) */
	sampleRate?: number;
	/** Connection timeout in ms */
	timeout?: number;
	/** Audio input device ID (optional, uses default if not specified) */
	audioDeviceId?: string;
}

type ResolvedLocalWhisperConfig = Required<Omit<LocalWhisperConfig, 'audioDeviceId'>> & { audioDeviceId?: string };

const DEFAULT_CONFIG: ResolvedLocalWhisperConfig = {
	serverUrl: 'http://127.0.0.1:8080',
	language: 'en',
	sampleRate: 16000,
	timeout: 30000,
	audioDeviceId: undefined,
};

/**
 * LocalWhisperService provides speech-to-text using a local whisper.cpp server
 */
export class LocalWhisperService {
	private config: ResolvedLocalWhisperConfig;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private isRecording: boolean = false;
	private isPaused: boolean = false;
	private stream: MediaStream | null = null;
	private recordingStartTime: number = 0;

	constructor(config?: LocalWhisperConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config } as ResolvedLocalWhisperConfig;
	}

	/**
	 * Check if local whisper service is supported
	 * MediaRecorder should be available in Electron/Obsidian
	 */
	async isSupported(): Promise<boolean> {
		// Check MediaRecorder support
		if (typeof MediaRecorder === 'undefined') {
			console.log('LocalWhisperService: MediaRecorder not available');
			return false;
		}

		// Check if we can get user media
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			console.log('LocalWhisperService: getUserMedia not available');
			return false;
		}

		return true;
	}

	/**
	 * Check if the whisper server is reachable
	 */
	async checkServerConnection(): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(this.config.serverUrl, {
				method: 'GET',
				signal: controller.signal,
			});

			clearTimeout(timeoutId);
			return response.ok || response.status === 404; // Server is up even if GET / returns 404
		} catch (error) {
			console.log('LocalWhisperService: Server not reachable:', error);
			return false;
		}
	}

	/**
	 * Initialize the service - request microphone permission
	 */
	async initialize(): Promise<void> {
		const supported = await this.isSupported();
		if (!supported) {
			throw new Error('MediaRecorder or getUserMedia not supported');
		}

		// Pre-check microphone permission (will prompt user if needed)
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			// Release the stream immediately, we'll get a new one when recording
			stream.getTracks().forEach(track => track.stop());
			console.log('LocalWhisperService: Microphone access granted');
		} catch (error) {
			throw new Error(`Microphone access denied: ${error}`);
		}

		console.log('LocalWhisperService: Initialized');
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
				sampleRate: this.config.sampleRate,
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
			console.log('LocalWhisperService: Using MIME type:', mimeType);

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
				console.error('LocalWhisperService: MediaRecorder error:', event);
			};

			this.recordingStartTime = Date.now();
			this.isRecording = true;
			this.isPaused = false;

			// Start recording with timeslice to get chunks periodically
			this.mediaRecorder.start(1000); // Get data every second
			console.log('LocalWhisperService: Recording started');
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
				console.log(`LocalWhisperService: Recording stopped (${recordingDuration}ms)`);

				try {
					// Create blob from chunks
					const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
					const audioBlob = new Blob(this.audioChunks, { type: mimeType });
					console.log(`LocalWhisperService: Audio blob size: ${audioBlob.size} bytes`);

					// Cleanup recording resources
					this.cleanup();

					// Send to whisper server
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
		console.log('LocalWhisperService: Recording cancelled');
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
		console.log('LocalWhisperService: Recording paused');
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
		console.log('LocalWhisperService: Recording resumed');
	}

	/**
	 * Send audio to the whisper server for transcription
	 */
	private async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
		const transcribeStart = Date.now();

		// Create form data for the request
		const formData = new FormData();
		
		// whisper.cpp server expects 'file' field with the audio file
		// The server can handle various formats if --convert flag is enabled
		const filename = this.getFilenameForMimeType(audioBlob.type);
		formData.append('file', audioBlob, filename);
		
		// Add optional parameters
		formData.append('response_format', 'json');
		if (this.config.language && this.config.language !== 'auto') {
			formData.append('language', this.config.language);
		}
		formData.append('temperature', '0.0');

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

			const inferenceUrl = `${this.config.serverUrl}/inference`;
			console.log(`LocalWhisperService: Sending audio to ${inferenceUrl}`);

			const response = await fetch(inferenceUrl, {
				method: 'POST',
				body: formData,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Server error (${response.status}): ${errorText}`);
			}

			const result = await response.json();
			const transcribeDurationMs = Date.now() - transcribeStart;

			// Parse the response (whisper.cpp server format)
			const text = this.extractTextFromResponse(result);
			const segments = this.extractSegmentsFromResponse(result);

			console.log(`LocalWhisperService: Transcription completed in ${transcribeDurationMs}ms`);
			console.log(`LocalWhisperService: Text: "${text}"`);

			return {
				text,
				segments,
				transcribeDurationMs,
			};
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error('Transcription request timed out');
			}
			throw new Error(`Transcription failed: ${error}`);
		}
	}

	/**
	 * Extract text from whisper.cpp server response
	 * Handles both whisper.cpp native format and OpenAI-compatible format
	 */
	private extractTextFromResponse(response: unknown): string {
		if (!response || typeof response !== 'object') {
			return '';
		}

		const res = response as Record<string, unknown>;

		// OpenAI format: { text: "..." }
		if (typeof res.text === 'string') {
			return res.text.trim();
		}

		// whisper.cpp format: { transcription: [{ ... }] } or array of segments
		if (Array.isArray(res.transcription)) {
			return res.transcription
				.map((seg: { text?: string }) => seg.text || '')
				.join(' ')
				.trim();
		}

		// Direct array of segments
		if (Array.isArray(response)) {
			return (response as { text?: string }[])
				.map((seg) => seg.text || '')
				.join(' ')
				.trim();
		}

		return '';
	}

	/**
	 * Extract segments from whisper.cpp server response
	 */
	private extractSegmentsFromResponse(response: unknown): TranscriptionSegment[] {
		if (!response || typeof response !== 'object') {
			return [];
		}

		const res = response as Record<string, unknown>;
		let rawSegments: unknown[] = [];

		// whisper.cpp format: { transcription: [{ ... }] }
		if (Array.isArray(res.transcription)) {
			rawSegments = res.transcription;
		}
		// OpenAI format: { segments: [{ ... }] }
		else if (Array.isArray(res.segments)) {
			rawSegments = res.segments;
		}
		// Direct array
		else if (Array.isArray(response)) {
			rawSegments = response;
		}

		return rawSegments.map((seg: unknown) => {
			const s = seg as Record<string, unknown>;
			return {
				text: (typeof s.text === 'string' ? s.text : '').trim(),
				timeStart: typeof s.t0 === 'number' ? s.t0 : (typeof s.start === 'number' ? s.start * 1000 : 0),
				timeEnd: typeof s.t1 === 'number' ? s.t1 : (typeof s.end === 'number' ? s.end * 1000 : 0),
			};
		}).filter(seg => seg.text.length > 0);
	}

	/**
	 * Get a supported MIME type for MediaRecorder
	 */
	private getSupportedMimeType(): string {
		const types = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/ogg;codecs=opus',
			'audio/ogg',
			'audio/mp4',
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
		if (mimeType.includes('ogg')) return 'audio.ogg';
		if (mimeType.includes('mp4')) return 'audio.mp4';
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
	updateConfig(config: Partial<LocalWhisperConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current server URL
	 */
	getServerUrl(): string {
		return this.config.serverUrl;
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
