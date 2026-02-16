/**
 * @module whisper
 * @description Whisper transcription services for voice-to-text.
 * 
 * Provides multiple backends for speech-to-text transcription:
 * - **LocalWhisperService** - Local whisper.cpp server
 * - **OpenAIWhisperService** - OpenAI Whisper API
 * - **AzureWhisperService** - Azure OpenAI Whisper API
 * - **WhisperCppManager** - Local whisper.cpp binary/model management
 * 
 * @since 0.0.14
 */

export { LocalWhisperService, type LocalWhisperConfig } from './LocalWhisperService';
export { OpenAIWhisperService, type OpenAIWhisperConfig } from './OpenAIWhisperService';
export { AzureWhisperService, type AzureWhisperConfig, getAzureOpenAIApiKey } from './AzureWhisperService';
export { 
	WhisperCppManager, 
	WHISPER_MODELS, 
	type WhisperModel, 
	type WhisperServerStatus, 
	type WhisperInstallStatus, 
	type DownloadProgressCallback 
} from './WhisperCppManager';
