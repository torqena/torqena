/**
 * Platform detection constants replicating Obsidian's Platform object.
 *
 * In plain browser mode, desktop/mobile app flags remain false to preserve
 * safe web-only behavior. In the Electron web-shell, flags are inferred from
 * `window.electronAPI` and user agent/platform so desktop-only features
 * (Copilot CLI, stdio MCP) can be enabled.
 */

const hasWindow = typeof window !== "undefined";
const hasNavigator = typeof navigator !== "undefined";
const isElectron = hasWindow && Boolean((window as any).electronAPI?.isElectron);
const userAgent = hasNavigator ? navigator.userAgent : "";
const platform = hasNavigator ? navigator.platform : "";

const isWin = /Win/i.test(platform);
const isMacOS = /Mac/i.test(platform);
const isLinux = /Linux/i.test(platform);
const isPhone = /iPhone|Android.*Mobile/i.test(userAgent);
const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
const isMobile = isPhone || isTablet;

export const Platform = {
	isDesktop: isElectron,
	isDesktopApp: isElectron,
	isMobile: false,
	isMobileApp: false,
	isMacOS,
	isWin,
	isLinux,
	isIosApp: false,
	isAndroidApp: false,
	isPhone,
	isTablet,
	isSafari: /Safari/i.test(userAgent) && !/Chrome|Chromium|Electron/i.test(userAgent),
} as const;

/** Type for Electron platform info from window.electronAPI.getPlatformInfo() */
export interface PlatformInfo {
	platform: string;
	arch: string;
	nodeVersion: string;
	electronVersion: string;
	isPackaged: boolean;
	appPath: string;
	userData: string;
}
