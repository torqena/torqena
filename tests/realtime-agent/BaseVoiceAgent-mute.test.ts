/**
 * Unit tests for BaseVoiceAgent mute functionality
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BaseVoiceAgent } from "../../src/ai/realtime-agent/BaseVoiceAgent";
import type { BaseVoiceAgentConfig } from "../../src/ai/realtime-agent/types";
import type { tool } from "@openai/agents/realtime";
import { App } from "obsidian";

// Create a concrete test implementation of BaseVoiceAgent
class TestVoiceAgent extends BaseVoiceAgent {
	getInstructions(): string {
		return "Test instructions";
	}

	getHandoffDescription(): string {
		return "Test handoff description";
	}

	getTools(): ReturnType<typeof tool>[] {
		return [];
	}

	// Expose session for testing
	public setMockSession(session: any): void {
		this.session = session;
	}
}

describe("BaseVoiceAgent - Mute functionality", () => {
	let agent: TestVoiceAgent;
	let mockApp: App;
	let config: BaseVoiceAgentConfig;

	beforeEach(() => {
		mockApp = {} as App;
		config = {
			apiKey: "test-key",
			voice: "alloy",
		};
		agent = new TestVoiceAgent("Test Agent", mockApp, config);
	});

	describe("isMuted()", () => {
		it("should return false when no session exists", () => {
			expect(agent.isMuted()).toBe(false);
		});

		it("should return false when session.muted is false", () => {
			const mockSession = {
				muted: false,
			};
			agent.setMockSession(mockSession);
			expect(agent.isMuted()).toBe(false);
		});

		it("should return true when session.muted is true", () => {
			const mockSession = {
				muted: true,
			};
			agent.setMockSession(mockSession);
			expect(agent.isMuted()).toBe(true);
		});

		it("should return false when session.muted is null", () => {
			const mockSession = {
				muted: null,
			};
			agent.setMockSession(mockSession);
			expect(agent.isMuted()).toBe(false);
		});
	});

	describe("mute()", () => {
		it("should do nothing when no session exists", () => {
			// Should not throw
			expect(() => agent.mute()).not.toThrow();
		});

		it("should call session.mute(true) when session exists", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: false,
			};
			agent.setMockSession(mockSession);

			agent.mute();

			expect(muteFn).toHaveBeenCalledWith(true);
		});

		it("should emit muteChange event when successful", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: false,
			};
			agent.setMockSession(mockSession);

			const muteChangeHandler = vi.fn();
			agent.on("muteChange", muteChangeHandler);

			agent.mute();

			expect(muteChangeHandler).toHaveBeenCalledWith(true);
		});

		it("should handle errors gracefully", () => {
			const muteFn = vi.fn().mockImplementation(() => {
				throw new Error("Mute failed");
			});
			const mockSession = {
				mute: muteFn,
				muted: false,
			};
			agent.setMockSession(mockSession);

			// Should not throw
			expect(() => agent.mute()).not.toThrow();
		});
	});

	describe("unmute()", () => {
		it("should do nothing when no session exists", () => {
			// Should not throw
			expect(() => agent.unmute()).not.toThrow();
		});

		it("should call session.mute(false) when session exists", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: true,
			};
			agent.setMockSession(mockSession);

			agent.unmute();

			expect(muteFn).toHaveBeenCalledWith(false);
		});

		it("should emit muteChange event when successful", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: true,
			};
			agent.setMockSession(mockSession);

			const muteChangeHandler = vi.fn();
			agent.on("muteChange", muteChangeHandler);

			agent.unmute();

			expect(muteChangeHandler).toHaveBeenCalledWith(false);
		});

		it("should handle errors gracefully", () => {
			const muteFn = vi.fn().mockImplementation(() => {
				throw new Error("Unmute failed");
			});
			const mockSession = {
				mute: muteFn,
				muted: true,
			};
			agent.setMockSession(mockSession);

			// Should not throw
			expect(() => agent.unmute()).not.toThrow();
		});
	});

	describe("toggleMute()", () => {
		it("should mute when currently unmuted", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: false,
			};
			agent.setMockSession(mockSession);

			agent.toggleMute();

			expect(muteFn).toHaveBeenCalledWith(true);
		});

		it("should unmute when currently muted", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: true,
			};
			agent.setMockSession(mockSession);

			agent.toggleMute();

			expect(muteFn).toHaveBeenCalledWith(false);
		});

		it("should emit appropriate muteChange events", () => {
			const muteFn = vi.fn();
			const mockSession = {
				mute: muteFn,
				muted: false,
			};
			agent.setMockSession(mockSession);

			const muteChangeHandler = vi.fn();
			agent.on("muteChange", muteChangeHandler);

			// First toggle: mute
			agent.toggleMute();
			expect(muteChangeHandler).toHaveBeenCalledWith(true);

			// Update mock state
			mockSession.muted = true;
			muteChangeHandler.mockClear();

			// Second toggle: unmute
			agent.toggleMute();
			expect(muteChangeHandler).toHaveBeenCalledWith(false);
		});
	});
});



