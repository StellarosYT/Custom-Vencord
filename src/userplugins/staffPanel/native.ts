/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";

const PANEL_URL = "https://afterhours-nsfw.fr/panel";
const SCROLLBAR_STYLES = `
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-corner {
        background: transparent;
    }

    ::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 8px;
        background: #4e5058;
        background-clip: padding-box;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: #6d6f78;
        background-clip: padding-box;
    }
`;

interface PanelBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    screenX: number;
    screenY: number;
}

interface PanelEntry {
    owner: BrowserWindow;
    renderer: WebContents;
    window: BrowserWindow | null;
    bounds: PanelBounds;
    ownerPosition: { x: number; y: number; };
    visible: boolean;
    htmlFullscreen: boolean;
    resizeTimer: ReturnType<typeof setTimeout> | null;
    onOwnerMove: () => void;
    onOwnerResize: () => void;
    onOwnerFullscreenChange: () => void;
    onOwnerHtmlFullscreenEnter: () => void;
    onOwnerHtmlFullscreenLeave: () => void;
    onOwnerFocus: () => void;
    onOwnerBlur: () => void;
    onOwnerMinimize: () => void;
    onOwnerRestore: () => void;
    onOwnerClosed: () => void;
    onRendererDestroyed: () => void;
    onPanelFocus: (() => void) | null;
    onPanelBlur: (() => void) | null;
    onPanelBoundsChange: (() => void) | null;
    onWindowClosed: (() => void) | null;
}

const TITLEBAR_HEIGHT = 38;
const MIN_WINDOW_WIDTH = 358;
const MIN_WINDOW_HEIGHT = 240;

const panels = new Map<number, PanelEntry>();

function getPanel(event: IpcMainInvokeEvent) {
    const entry = panels.get(event.sender.id);
    if (!entry || entry.owner.isDestroyed())
        throw new Error("The Staff Panel window is not available.");

    return entry;
}

function isOwnerFullscreen(entry: PanelEntry) {
    return entry.owner.isFullScreen() || entry.owner.isMaximized() || entry.htmlFullscreen;
}

function getWindowBounds(entry: PanelEntry, bounds = entry.bounds) {
    const contentBounds = entry.owner.getContentBounds();
    const x = Math.min(Math.max(0, Math.round(bounds.x)), Math.max(0, contentBounds.width - 1));
    const y = Math.min(Math.max(0, Math.round(bounds.y)), Math.max(0, contentBounds.height - 1));
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    return {
        x: Math.round(bounds.screenX + x),
        y: Math.round(bounds.screenY + y),
        width: Math.min(width, Math.max(1, contentBounds.width - x)),
        height: Math.min(height, Math.max(1, contentBounds.height - y))
    };
}

function handleOwnerMove(entry: PanelEntry) {
    const [x, y] = entry.owner.getPosition();
    entry.bounds.screenX += x - entry.ownerPosition.x;
    entry.bounds.screenY += y - entry.ownerPosition.y;
    entry.ownerPosition = { x, y };
    updateWindowBounds(entry);
}

function updateWindowBounds(entry: PanelEntry) {
    if (!entry.owner.isDestroyed() && entry.window && !entry.window.isDestroyed())
        entry.window.setBounds(getWindowBounds(entry));
}

function handlePanelBoundsChange(entry: PanelEntry, panelWindow: BrowserWindow) {
    if (entry.window !== panelWindow || entry.renderer.isDestroyed() || panelWindow.isDestroyed())
        return;

    const { x, y, width, height } = panelWindow.getBounds();
    const bounds = {
        x: x - entry.bounds.screenX - 1,
        y: y - entry.bounds.screenY - TITLEBAR_HEIGHT - 1,
        width: width + 2,
        height: height + TITLEBAR_HEIGHT + 2
    };

    entry.renderer.executeJavaScript(
        `requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("vc-staff-panel-window-bounds", { detail: ${JSON.stringify(bounds)} })));`
    ).catch(error => console.error("[StaffPanel] Failed to sync native resize", error));
}

function handleOwnerResize(entry: PanelEntry) {
    const fullscreen = isOwnerFullscreen(entry);
    if (!fullscreen) {
        entry.visible = false;
        closePanelWindow(entry);
    }
    updateWindowBounds(entry);

    if (entry.resizeTimer !== null)
        clearTimeout(entry.resizeTimer);

    entry.resizeTimer = setTimeout(() => {
        entry.resizeTimer = null;
        if (entry.renderer.isDestroyed()) return;

        notifyRenderer(entry, "vc-staff-panel-owner-resize");
        notifyRenderer(entry, "vc-staff-panel-fullscreen-change", fullscreen);
    }, 50);
}

function notifyRenderer(entry: PanelEntry, eventName: string, detail?: boolean) {
    const eventExpression = detail === undefined
        ? `new Event('${eventName}')`
        : `new CustomEvent('${eventName}', { detail: ${detail} })`;

    entry.renderer.executeJavaScript(
        `requestAnimationFrame(() => window.dispatchEvent(${eventExpression}));`
    ).catch(error => console.error("[StaffPanel] Failed to notify the renderer", error));
}

function handleOwnerFullscreenChange(entry: PanelEntry) {
    handleOwnerResize(entry);
}

function handleOwnerHtmlFullscreenChange(entry: PanelEntry, fullscreen: boolean) {
    entry.htmlFullscreen = fullscreen;
    handleOwnerResize(entry);
}

function syncPanelTopmost(entry: PanelEntry) {
    if (entry.owner.isDestroyed() || !entry.window || entry.window.isDestroyed()) return;

    const shouldBeOnTop = entry.visible &&
        isOwnerFullscreen(entry) &&
        entry.owner.isVisible() &&
        !entry.owner.isMinimized() &&
        BrowserWindow.getFocusedWindow() !== null;

    entry.window.setAlwaysOnTop(shouldBeOnTop, "screen-saver");
}

function schedulePanelTopmostSync(entry: PanelEntry) {
    setTimeout(() => syncPanelTopmost(entry), 0);
}

function setPanelVisible(entry: PanelEntry, visible: boolean) {
    entry.visible = visible;

    if (visible && isOwnerFullscreen(entry) && entry.window && !entry.window.isDestroyed()) {
        updateWindowBounds(entry);
        syncPanelTopmost(entry);
        entry.window.show();
    } else if (entry.window && !entry.window.isDestroyed()) {
        entry.window.hide();
    }
}

function closePanelWindow(entry: PanelEntry) {
    const { window } = entry;
    if (!window) return;

    entry.window = null;
    if (entry.onPanelFocus)
        window.removeListener("focus", entry.onPanelFocus);
    if (entry.onPanelBlur)
        window.removeListener("blur", entry.onPanelBlur);
    if (entry.onPanelBoundsChange) {
        window.removeListener("resize", entry.onPanelBoundsChange);
        window.removeListener("move", entry.onPanelBoundsChange);
    }
    if (entry.onWindowClosed)
        window.removeListener("closed", entry.onWindowClosed);
    entry.onPanelFocus = null;
    entry.onPanelBlur = null;
    entry.onPanelBoundsChange = null;
    entry.onWindowClosed = null;

    if (!window.isDestroyed())
        window.destroy();
}

function disposePanel(rendererId: number, entry: PanelEntry) {
    if (panels.get(rendererId) !== entry) return;
    panels.delete(rendererId);

    if (entry.resizeTimer !== null)
        clearTimeout(entry.resizeTimer);
    entry.owner.removeListener("move", entry.onOwnerMove);
    entry.owner.removeListener("resize", entry.onOwnerResize);
    entry.owner.removeListener("enter-full-screen", entry.onOwnerFullscreenChange);
    entry.owner.removeListener("leave-full-screen", entry.onOwnerFullscreenChange);
    entry.owner.removeListener("maximize", entry.onOwnerFullscreenChange);
    entry.owner.removeListener("unmaximize", entry.onOwnerFullscreenChange);
    entry.owner.webContents.removeListener("enter-html-full-screen", entry.onOwnerHtmlFullscreenEnter);
    entry.owner.webContents.removeListener("leave-html-full-screen", entry.onOwnerHtmlFullscreenLeave);
    entry.owner.removeListener("focus", entry.onOwnerFocus);
    entry.owner.removeListener("blur", entry.onOwnerBlur);
    entry.owner.removeListener("minimize", entry.onOwnerMinimize);
    entry.owner.removeListener("restore", entry.onOwnerRestore);
    entry.owner.removeListener("closed", entry.onOwnerClosed);
    entry.renderer.removeListener("destroyed", entry.onRendererDestroyed);
    closePanelWindow(entry);
}

async function createPanelWindow(entry: PanelEntry) {
    if (entry.window) return;
    if (!isOwnerFullscreen(entry))
        throw new Error("The Staff Panel is available only when Discord is maximized or fullscreen.");

    const panelWindow = new BrowserWindow({
        parent: entry.owner,
        title: "Staff Panel",
        width: Math.max(1, Math.round(entry.bounds.width)),
        height: Math.max(1, Math.round(entry.bounds.height)),
        frame: false,
        transparent: false,
        resizable: true,
        minWidth: MIN_WINDOW_WIDTH,
        minHeight: MIN_WINDOW_HEIGHT,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        show: false,
        backgroundColor: "#1f1b26",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    entry.window = panelWindow;
    entry.onPanelFocus = () => schedulePanelTopmostSync(entry);
    entry.onPanelBlur = () => schedulePanelTopmostSync(entry);
    entry.onPanelBoundsChange = () => handlePanelBoundsChange(entry, panelWindow);
    entry.onWindowClosed = () => {
        if (entry.window !== panelWindow) return;
        entry.window = null;
        entry.onPanelFocus = null;
        entry.onPanelBlur = null;
        entry.onPanelBoundsChange = null;
        entry.onWindowClosed = null;
    };
    panelWindow.on("focus", entry.onPanelFocus);
    panelWindow.on("blur", entry.onPanelBlur);
    panelWindow.on("resize", entry.onPanelBoundsChange);
    panelWindow.on("move", entry.onPanelBoundsChange);
    panelWindow.once("closed", entry.onWindowClosed);
    panelWindow.webContents.on("did-finish-load", () => {
        panelWindow.webContents.insertCSS(SCROLLBAR_STYLES).catch(error => {
            console.error("[StaffPanel] Failed to apply scrollbar styles", error);
        });
    });
    panelWindow.webContents.on("did-fail-load", (_loadEvent, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame)
            console.error("[StaffPanel] Web page failed to load", errorCode, errorDescription, validatedURL);
    });

    try {
        updateWindowBounds(entry);
        await panelWindow.loadURL(PANEL_URL);
        if (!panels.has(entry.renderer.id) || entry.window !== panelWindow || panelWindow.isDestroyed())
            return;

        setPanelVisible(entry, entry.visible);
    } catch (error) {
        closePanelWindow(entry);
        throw new Error(`Failed to load ${PANEL_URL}: ${String(error)}`);
    }
}

export async function isFullscreen(event: IpcMainInvokeEvent) {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed())
        throw new Error("Could not find the Discord window for the Staff Panel.");

    const entry = panels.get(event.sender.id);
    if (entry?.htmlFullscreen || owner.isFullScreen() || owner.isMaximized())
        return true;

    return owner.webContents.executeJavaScript("Boolean(document.fullscreenElement)");
}

export async function createView(event: IpcMainInvokeEvent, bounds: PanelBounds, open: boolean) {
    if (typeof open !== "boolean")
        throw new Error("The Staff Panel received an invalid open state.");

    const rendererId = event.sender.id;
    const existing = panels.get(rendererId);
    if (existing) {
        if (existing.owner.isDestroyed()) {
            disposePanel(rendererId, existing);
        } else {
            existing.bounds = bounds;
            const [x, y] = existing.owner.getPosition();
            existing.ownerPosition = { x, y };
            if (!open || !isOwnerFullscreen(existing)) {
                closePanelWindow(existing);
                return;
            }
            if (existing.window?.isDestroyed())
                closePanelWindow(existing);
            await createPanelWindow(existing);
            setPanelVisible(existing, existing.visible);
            return;
        }
    }

    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed())
        throw new Error("Could not find the Discord window for the Staff Panel.");
    if (open && !owner.isFullScreen() && !owner.isMaximized())
        throw new Error("The Staff Panel is available only when Discord is maximized or fullscreen.");

    const [ownerX, ownerY] = owner.getPosition();
    const entry: PanelEntry = {
        owner,
        renderer: event.sender,
        window: null,
        bounds,
        ownerPosition: { x: ownerX, y: ownerY },
        visible: open,
        htmlFullscreen: false,
        resizeTimer: null,
        onPanelFocus: null,
        onPanelBlur: null,
        onPanelBoundsChange: null,
        onWindowClosed: null,
        onOwnerMove: () => handleOwnerMove(entry),
        onOwnerResize: () => handleOwnerResize(entry),
        onOwnerFullscreenChange: () => handleOwnerFullscreenChange(entry),
        onOwnerHtmlFullscreenEnter: () => handleOwnerHtmlFullscreenChange(entry, true),
        onOwnerHtmlFullscreenLeave: () => handleOwnerHtmlFullscreenChange(entry, false),
        onOwnerFocus: () => schedulePanelTopmostSync(entry),
        onOwnerBlur: () => schedulePanelTopmostSync(entry),
        onOwnerMinimize: () => entry.window?.hide(),
        onOwnerRestore: () => {
            if (entry.visible)
                setPanelVisible(entry, true);
        },
        onOwnerClosed: () => disposePanel(rendererId, entry),
        onRendererDestroyed: () => disposePanel(rendererId, entry)
    };

    panels.set(rendererId, entry);
    owner.on("move", entry.onOwnerMove);
    owner.on("resize", entry.onOwnerResize);
    owner.on("enter-full-screen", entry.onOwnerFullscreenChange);
    owner.on("leave-full-screen", entry.onOwnerFullscreenChange);
    owner.on("maximize", entry.onOwnerFullscreenChange);
    owner.on("unmaximize", entry.onOwnerFullscreenChange);
    owner.webContents.on("enter-html-full-screen", entry.onOwnerHtmlFullscreenEnter);
    owner.webContents.on("leave-html-full-screen", entry.onOwnerHtmlFullscreenLeave);
    owner.on("focus", entry.onOwnerFocus);
    owner.on("blur", entry.onOwnerBlur);
    owner.on("minimize", entry.onOwnerMinimize);
    owner.on("restore", entry.onOwnerRestore);
    owner.once("closed", entry.onOwnerClosed);
    event.sender.once("destroyed", entry.onRendererDestroyed);

    if (!open)
        return;

    try {
        await createPanelWindow(entry);
        setPanelVisible(entry, true);
    } catch (error) {
        disposePanel(rendererId, entry);
        throw error;
    }
}

export function setBounds(event: IpcMainInvokeEvent, bounds: PanelBounds) {
    const entry = getPanel(event);
    if (!Object.values(bounds).every(Number.isFinite))
        throw new Error("The Staff Panel received invalid bounds.");

    entry.bounds = bounds;
    const [ownerX, ownerY] = entry.owner.getPosition();
    entry.ownerPosition = { x: ownerX, y: ownerY };
    updateWindowBounds(entry);
}

export async function setVisible(event: IpcMainInvokeEvent, visible: boolean) {
    if (typeof visible !== "boolean")
        throw new Error("The Staff Panel received an invalid visibility state.");

    const entry = getPanel(event);
    if (visible && isOwnerFullscreen(entry) && !entry.window)
        await createPanelWindow(entry);
    setPanelVisible(entry, visible);
}

export function goBack(event: IpcMainInvokeEvent) {
    const { window } = getPanel(event);
    if (!window || window.isDestroyed()) return;
    if (window.webContents.canGoBack())
        window.webContents.goBack();
}

export function goForward(event: IpcMainInvokeEvent) {
    const { window } = getPanel(event);
    if (!window || window.isDestroyed()) return;
    if (window.webContents.canGoForward())
        window.webContents.goForward();
}

export async function reload(event: IpcMainInvokeEvent) {
    const entry = getPanel(event);
    if (!isOwnerFullscreen(entry))
        throw new Error("The Staff Panel can only be refreshed while Discord is maximized or fullscreen.");

    const { window } = entry;
    if (!window || window.isDestroyed())
        throw new Error("The Staff Panel window is not open.");

    window.webContents.reload();
}

export function closeView(event: IpcMainInvokeEvent) {
    const entry = panels.get(event.sender.id);
    if (entry) closePanelWindow(entry);
}

export function destroyView(event: IpcMainInvokeEvent) {
    const entry = panels.get(event.sender.id);
    if (entry) disposePanel(event.sender.id, entry);
}
