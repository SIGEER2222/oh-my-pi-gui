/**
 * Relaunching a running app must surface it. `focus()` alone silently did
 * nothing while the window was hidden (tray "Hide OMP GUI") or minimized, so
 * every second launch looked like a dead app.
 */

import { describe, expect, it, vi, type Mock } from "vitest";
import { setupDeepLinks } from "./deep-link";
import type { SpawnWindow, WindowManager } from "./window";

const { handlers } = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock("electron", () => ({
	app: {
		on: (event: string, handler: (...args: unknown[]) => void) => {
			handlers.set(event, handler);
		},
		setAsDefaultProtocolClient: vi.fn(),
	},
}));

interface FakeWindow {
	webContents: { isLoading: () => boolean; send: Mock; once: Mock };
	isDestroyed: () => boolean;
	isVisible: () => boolean;
	isMinimized: () => boolean;
	restore: Mock;
	show: Mock;
	focus: Mock;
}

function fakeWindow(state: { hidden?: boolean; minimized?: boolean } = {}): FakeWindow {
	return {
		webContents: { isLoading: () => false, send: vi.fn(), once: vi.fn() },
		isDestroyed: () => false,
		isVisible: () => !state.hidden,
		isMinimized: () => state.minimized ?? false,
		restore: vi.fn(() => {
			state.minimized = false;
		}),
		show: vi.fn(() => {
			state.hidden = false;
		}),
		focus: vi.fn(),
	};
}

function windowManager(win: FakeWindow | null): WindowManager {
	const manager = {
		getTargetWindow: () => win,
		getMainWindow: () => win,
		getAllWindows: () => (win ? [win] : []),
		recordFor: () => undefined,
	};
	return manager as unknown as WindowManager;
}

/** A bare relaunch: the second instance contributed no link and no workspace. */
const bareRelaunch = ["omp.exe"];

describe("second-instance handoff", () => {
	it("un-hides and raises a hidden window instead of only focusing it", () => {
		const win = fakeWindow({ hidden: true });
		const spawnWindow = vi.fn();
		setupDeepLinks(windowManager(win), spawnWindow as unknown as SpawnWindow);

		handlers.get("second-instance")?.({}, bareRelaunch);

		expect(win.show).toHaveBeenCalled();
		expect(win.focus).toHaveBeenCalled();
		expect(win.isVisible()).toBe(true);
		expect(spawnWindow).not.toHaveBeenCalled();
	});

	it("restores a minimized window", () => {
		const win = fakeWindow({ minimized: true });
		setupDeepLinks(windowManager(win), vi.fn() as unknown as SpawnWindow);

		handlers.get("second-instance")?.({}, bareRelaunch);

		expect(win.restore).toHaveBeenCalled();
		expect(win.show).toHaveBeenCalled();
		expect(win.isMinimized()).toBe(false);
	});

	it("opens a window when the running app has none (closed to tray)", () => {
		const spawned = fakeWindow({ hidden: true });
		const spawnWindow = vi.fn(() => spawned);
		setupDeepLinks(windowManager(null), spawnWindow as unknown as SpawnWindow);

		handlers.get("second-instance")?.({}, bareRelaunch);

		expect(spawnWindow).toHaveBeenCalled();
		expect(spawned.show).toHaveBeenCalled();
	});
});
