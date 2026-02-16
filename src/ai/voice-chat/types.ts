// Copyright (c) 2026 Dan Shue. All rights reserved.
// Licensed under the MIT License.

/**
 * @module VoiceChatTypes
 * @description Type definitions for voice recording and transcription.
 *
 * Provides the enums and interfaces shared by the voice chat services and UI:
 * - Recording lifecycle state machine
 * - Transcription result and segment shapes
 * - Voice chat service contract and events
 *
 * @example
 * ```typescript
 * import type { RecordingState, TranscriptionResult } from './types';
 * const state: RecordingState = 'recording';
 * const result: TranscriptionResult = { text: 'hello', segments: [], transcribeDurationMs: 10 };
 * ```
 * @since 0.0.14
 */

/**
 * Recording state for the voice recorder
 */
export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'error';

/**
 * Transcription segment
 */
export interface TranscriptionSegment {
	/** Segment text */
	text: string;
	/** Start time in milliseconds */
	timeStart: number;
	/** End time in milliseconds */
	timeEnd: number;
}

/**
 * Result from transcription
 */
export interface TranscriptionResult {
	/** Full transcribed text */
	text: string;
	/** Individual segments */
	segments: TranscriptionSegment[];
	/** Time taken to transcribe in milliseconds */
	transcribeDurationMs: number;
}

/**
 * Callback for transcription segments (streaming)
 */
export type TranscriptionSegmentCallback = (segment: TranscriptionSegment) => void;

/**
 * Voice chat service interface
 */
export interface IVoiceChatService {
	/** Check if voice input is supported */
	isSupported(): Promise<boolean>;
	/** Initialize the service */
	initialize(): Promise<void>;
	/** Start recording */
	startRecording(): Promise<void>;
	/** Pause recording without ending the session */
	pauseRecording(): Promise<void>;
	/** Resume a paused recording */
	resumeRecording(): Promise<void>;
	/** Stop recording and get transcription */
	stopRecording(): Promise<TranscriptionResult>;
	/** Cancel recording without transcription */
	cancelRecording(): void;
	/** Get current recording state */
	getState(): RecordingState;
	/** Clean up resources */
	destroy(): void;
}

/**
 * Events emitted by the voice chat service
 */
export interface VoiceChatEvents {
	/** Recording state changed */
	stateChange: (state: RecordingState) => void;
	/** Transcription segment received (streaming) */
	segment: (segment: TranscriptionSegment) => void;
	/** Error occurred */
	error: (error: Error) => void;
}
