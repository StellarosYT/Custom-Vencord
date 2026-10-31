/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { ReactDOM, useEffect, useRef, useState } from "@webpack/common";
import type { PointerEvent as ReactPointerEvent } from "react";

const Native = VencordNative.pluginHelpers.StaffPanel as PluginNative<typeof import("./native")>;
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

const HEADER_HEIGHT = 38;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const PANEL_MARGIN = 24;
const PANEL_WIDTH_RATIO = 0.84;
const PANEL_HEIGHT_RATIO = 0.82;
const MAX_PANEL_WIDTH = 1100;
const MAX_PANEL_HEIGHT = 850;

function ResetPanelSizeButton() {
    return (
        <Button
            onClick={() => {
                settings.store.panelSize = null;
                window.dispatchEvent(new Event("vc-staff-panel-reset-bounds"));
            }}
        >
            Reset panel size
        </Button>
    );
}

const settings = definePluginSettings({
    resetPanelSize: {
        type: OptionType.COMPONENT,
        component: ResetPanelSizeButton
    }
}).withPrivateSettings<{
    panelSize?: { width: number; height: number; } | null;
}>();

interface PanelBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    screenX: number;
    screenY: number;
}

type NativePanelBounds = Pick<PanelBounds, "x" | "y" | "width" | "height">;

interface ViewportSize {
    width: number;
    height: number;
}

function getViewportSize(): ViewportSize {
    return {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight
    };
}

function isNativePanelBounds(value: unknown): value is NativePanelBounds {
    if (typeof value !== "object" || value === null) return false;

    const bounds = value as Partial<NativePanelBounds>;
    return Number.isFinite(bounds.x) &&
        Number.isFinite(bounds.y) &&
        Number.isFinite(bounds.width) &&
        Number.isFinite(bounds.height);
}

type Interaction = {
    pointerId: number;
    startX: number;
    startY: number;
    bounds: PanelBounds;
};

function getInitialBounds(): PanelBounds {
    const viewport = getViewportSize();
    const storedSize = settings.store.panelSize;
    const maxWidth = Math.max(1, viewport.width - PANEL_MARGIN);
    const maxHeight = Math.max(1, viewport.height - PANEL_MARGIN);
    const defaultWidth = Math.min(MAX_PANEL_WIDTH, Math.max(1, (viewport.width - PANEL_MARGIN * 2) * PANEL_WIDTH_RATIO));
    const defaultHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(1, (viewport.height - PANEL_MARGIN * 2) * PANEL_HEIGHT_RATIO));
    const storedWidth = storedSize && Number.isFinite(storedSize.width) ? storedSize.width : defaultWidth;
    const storedHeight = storedSize && Number.isFinite(storedSize.height) ? storedSize.height : defaultHeight;
    const width = Math.min(
        MAX_PANEL_WIDTH,
        maxWidth,
        Math.max(Math.min(MIN_WIDTH, maxWidth), storedWidth)
    );
    const height = Math.min(
        MAX_PANEL_HEIGHT,
        maxHeight,
        Math.max(Math.min(MIN_HEIGHT, maxHeight), storedHeight)
    );
    return {
        x: Math.max(PANEL_MARGIN, Math.round((viewport.width - width) / 2)),
        y: Math.max(PANEL_MARGIN, Math.round((viewport.height - height) / 2)),
        width,
        height,
        screenX: window.screenX,
        screenY: window.screenY
    };
}

function getViewBounds(bounds: PanelBounds) {
    return {
        x: bounds.x + 1,
        y: bounds.y + HEADER_HEIGHT + 1,
        width: Math.max(1, bounds.width - 2),
        height: Math.max(1, bounds.height - HEADER_HEIGHT - 2),
        screenX: window.screenX,
        screenY: window.screenY
    };
}

function clampBounds(bounds: PanelBounds, fillViewport = false): PanelBounds {
    const viewport = getViewportSize();
    const maxWidth = Math.max(1, viewport.width - (fillViewport ? 0 : PANEL_MARGIN));
    const maxHeight = Math.max(1, viewport.height - (fillViewport ? 0 : PANEL_MARGIN));
    const width = Math.min(Math.max(1, bounds.width), maxWidth);
    const height = Math.min(Math.max(1, bounds.height), maxHeight);

    return {
        x: Math.min(Math.max(0, bounds.x), Math.max(0, viewport.width - width)),
        y: Math.min(Math.max(0, bounds.y), Math.max(0, viewport.height - height)),
        width,
        height,
        screenX: window.screenX,
        screenY: window.screenY
    };
}

function adaptBoundsToViewport(bounds: PanelBounds, previous: ViewportSize, next: ViewportSize): PanelBounds {
    const maxWidth = Math.max(1, (next.width - PANEL_MARGIN * 2) * PANEL_WIDTH_RATIO);
    const maxHeight = Math.max(1, (next.height - PANEL_MARGIN * 2) * PANEL_HEIGHT_RATIO);
    const widthScale = next.width / Math.max(1, previous.width);
    const heightScale = next.height / Math.max(1, previous.height);
    const width = Math.min(MAX_PANEL_WIDTH, maxWidth, Math.max(Math.min(MIN_WIDTH, maxWidth), bounds.width * widthScale));
    const height = Math.min(MAX_PANEL_HEIGHT, maxHeight, Math.max(Math.min(MIN_HEIGHT, maxHeight), bounds.height * heightScale));

    return clampBounds({
        ...bounds,
        x: (next.width - width) / 2,
        y: (next.height - height) / 2,
        width,
        height
    });
}

function StaffPanelWidget() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [visible, setVisible] = useState(false);
    const [bounds, setBounds] = useState(getInitialBounds);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const viewReady = useRef(false);
    const panelRef = useRef<HTMLElement | null>(null);
    const boundsRef = useRef(bounds);
    const restoreBounds = useRef<PanelBounds | null>(null);
    const viewportRef = useRef<ViewportSize>(getViewportSize());
    const isExpandedRef = useRef(isExpanded);
    const visibleRef = useRef(visible);
    const interaction = useRef<Interaction | null>(null);
    const cleanupInteraction = useRef<(() => void) | null>(null);
    const boundsFrame = useRef<number | null>(null);
    const sizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function logError(reason: unknown) {
        console.error("[StaffPanel] Failed to manage the embedded panel", reason);
    }

    function showError(reason: unknown) {
        const message = reason instanceof Error ? reason.message : String(reason);
        logError(reason);
        setLoading(false);
        setError(message);
        if (viewReady.current)
            Native.setVisible(false).catch(logError);
    }

    function sendBounds(nextBounds: PanelBounds) {
        if (!viewReady.current) return;

        if (boundsFrame.current !== null)
            cancelAnimationFrame(boundsFrame.current);

        boundsFrame.current = requestAnimationFrame(() => {
            boundsFrame.current = null;
            Native.setBounds(getViewBounds(nextBounds)).catch(showError);
        });
    }

    function updateBounds(nextBounds: PanelBounds, render = true, syncNative = true, fillViewport = isExpandedRef.current) {
        const clamped = clampBounds(nextBounds, fillViewport);
        boundsRef.current = clamped;
        if (render)
            setBounds(clamped);
        else if (panelRef.current) {
            panelRef.current.style.left = `${clamped.x}px`;
            panelRef.current.style.top = `${clamped.y}px`;
            panelRef.current.style.width = `${clamped.width}px`;
            panelRef.current.style.height = `${clamped.height}px`;
        }
        if (syncNative)
            sendBounds(clamped);
    }

    function scheduleSaveSize() {
        if (isExpandedRef.current) return;

        if (sizeSaveTimer.current !== null)
            clearTimeout(sizeSaveTimer.current);

        sizeSaveTimer.current = setTimeout(() => {
            sizeSaveTimer.current = null;
            const { width, height } = boundsRef.current;
            settings.store.panelSize = { width, height };
        }, 300);
    }

    function toggleExpanded() {
        if (isExpandedRef.current) {
            isExpandedRef.current = false;
            setIsExpanded(false);
            const previousBounds = restoreBounds.current ?? getInitialBounds();
            restoreBounds.current = null;
            updateBounds(previousBounds);
            return;
        }

        if (sizeSaveTimer.current !== null) {
            clearTimeout(sizeSaveTimer.current);
            sizeSaveTimer.current = null;
        }
        const currentBounds = boundsRef.current;
        settings.store.panelSize = {
            width: currentBounds.width,
            height: currentBounds.height
        };
        restoreBounds.current = currentBounds;
        isExpandedRef.current = true;
        setIsExpanded(true);
        const viewport = getViewportSize();
        updateBounds({ ...currentBounds, x: 0, y: 0, width: viewport.width, height: viewport.height }, true, true, true);
    }

    function setPanelVisible(nextVisible: boolean) {
        visibleRef.current = nextVisible;
        setVisible(nextVisible);

        if (viewReady.current)
            Native.setVisible(nextVisible).catch(showError);
    }

    function navigateHistory(direction: "back" | "forward") {
        const navigate = direction === "back" ? Native.goBack : Native.goForward;
        navigate().catch(showError);
    }

    function WrenchIcon() {
        return (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <path
                    fill="currentColor"
                    d="M22.1 5.2a6.1 6.1 0 0 1-7.8 7.8l-7.6 7.6a2.1 2.1 0 0 1-3-3l7.6-7.6a6.1 6.1 0 0 1 7.8-7.8l-3.3 3.3.7 3.1 3.1.7 2.5-2.5Z"
                />
            </svg>
        );
    }

    function reloadPanel() {
        setError(null);
        Native.reload().catch(showError);
    }

    useEffect(() => {
        let cancelled = false;

        const onResize = () => {
            const nextViewport = getViewportSize();
            if (nextViewport.width === viewportRef.current.width && nextViewport.height === viewportRef.current.height)
                return;

            const nextBounds = isExpandedRef.current
                ? { ...boundsRef.current, x: 0, y: 0, width: nextViewport.width, height: nextViewport.height }
                : adaptBoundsToViewport(boundsRef.current, viewportRef.current, nextViewport);
            viewportRef.current = nextViewport;
            updateBounds(nextBounds, true, true, isExpandedRef.current);
        };
        const onNativePanelBoundsChange = (event: Event) => {
            const nativeBounds = (event as CustomEvent<unknown>).detail;
            if (!isNativePanelBounds(nativeBounds)) {
                logError(new Error("Received invalid native Staff Panel bounds."));
                return;
            }

            const previousBounds = boundsRef.current;
            updateBounds({ ...boundsRef.current, ...nativeBounds }, true, false, isExpandedRef.current);
            if (nativeBounds.width !== previousBounds.width || nativeBounds.height !== previousBounds.height)
                scheduleSaveSize();
        };
        const onResetPanelBounds = () => {
            if (sizeSaveTimer.current !== null) {
                clearTimeout(sizeSaveTimer.current);
                sizeSaveTimer.current = null;
            }
            restoreBounds.current = null;
            isExpandedRef.current = false;
            setIsExpanded(false);
            updateBounds(getInitialBounds(), true, true, false);
        };
        const onFullscreenChange = (event: Event) => {
            const fullscreen = (event as CustomEvent<unknown>).detail;
            if (typeof fullscreen !== "boolean") {
                logError(new Error("Received an invalid Discord fullscreen state."));
                return;
            }
            if (!fullscreen)
                setPanelVisible(false);
            setIsFullscreen(fullscreen);
        };
        window.addEventListener("vc-staff-panel-fullscreen-change", onFullscreenChange);
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(document.documentElement);
        window.addEventListener("resize", onResize);
        window.addEventListener("vc-staff-panel-owner-resize", onResize);
        window.addEventListener("vc-staff-panel-window-bounds", onNativePanelBoundsChange);
        window.addEventListener("vc-staff-panel-reset-bounds", onResetPanelBounds);
        window.visualViewport?.addEventListener("resize", onResize);
        Native.isFullscreen().then(fullscreen => {
            if (!cancelled) setIsFullscreen(fullscreen);
        }).catch(showError);

        return () => {
            cancelled = true;
            window.removeEventListener("vc-staff-panel-fullscreen-change", onFullscreenChange);
            resizeObserver.disconnect();
            window.removeEventListener("resize", onResize);
            window.removeEventListener("vc-staff-panel-owner-resize", onResize);
            window.removeEventListener("vc-staff-panel-window-bounds", onNativePanelBoundsChange);
            window.removeEventListener("vc-staff-panel-reset-bounds", onResetPanelBounds);
            window.visualViewport?.removeEventListener("resize", onResize);
            cleanupInteraction.current?.();
            if (boundsFrame.current !== null)
                cancelAnimationFrame(boundsFrame.current);
            if (sizeSaveTimer.current !== null)
                clearTimeout(sizeSaveTimer.current);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        Native.createView(getViewBounds(boundsRef.current), isFullscreen && visibleRef.current).then(() => {
            if (cancelled) {
                Native.closeView().catch(logError);
                return;
            }

            viewReady.current = isFullscreen;
            if (isFullscreen) {
                setLoading(false);
                setError(null);
                Native.setBounds(getViewBounds(boundsRef.current)).catch(showError);
                Native.setVisible(visibleRef.current).catch(showError);
            }
        }).catch(reason => {
            if (!cancelled) showError(reason);
        });

        return () => {
            cancelled = true;
            viewReady.current = false;
            Native.closeView().catch(logError);
        };
    }, [isFullscreen]);

    useEffect(() => () => {
        viewReady.current = false;
        Native.destroyView().catch(logError);
    }, []);

    function beginInteraction(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button")) return;

        event.preventDefault();
        event.stopPropagation();

        interaction.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            bounds: boundsRef.current
        };

        const onPointerMove = (pointerEvent: PointerEvent) => {
            const active = interaction.current;
            if (!active || active.pointerId !== pointerEvent.pointerId) return;

            const deltaX = pointerEvent.clientX - active.startX;
            const deltaY = pointerEvent.clientY - active.startY;

            updateBounds({
                ...active.bounds,
                x: active.bounds.x + deltaX,
                y: active.bounds.y + deltaY
            }, false);
        };

        const onPointerUp = (pointerEvent: PointerEvent) => {
            if (interaction.current?.pointerId !== pointerEvent.pointerId) return;
            setBounds(boundsRef.current);
            cleanupInteraction.current?.();
        };

        const cleanup = () => {
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("pointercancel", onPointerUp);
            window.removeEventListener("blur", onBlur);
            interaction.current = null;
            cleanupInteraction.current = null;
        };

        const onBlur = () => {
            setBounds(boundsRef.current);
            cleanup();
        };

        cleanupInteraction.current?.();
        cleanupInteraction.current = cleanup;
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
        window.addEventListener("blur", onBlur);
    }

    return (
        <div className="vc-staff-panel-root">
            <HeaderBarIcon
                className="vc-staff-panel-button"
                onClick={() => {
                    if (isFullscreen)
                        setPanelVisible(!visibleRef.current);
                }}
                tooltip={isFullscreen
                    ? visible ? "Hide Staff Panel" : "Show Staff Panel"
                    : "Maximize Discord to use Staff Panel"}
                icon={() => <WrenchIcon />}
                selected={visible}
            />
            {isFullscreen && visible && ReactDOM.createPortal(
                <section
                    ref={panelRef}
                    className="vc-staff-panel-window"
                    aria-label="Staff Panel"
                    style={{
                        left: bounds.x,
                        top: bounds.y,
                        width: bounds.width,
                        height: bounds.height
                    }}
                >
                    <header
                        className="vc-staff-panel-titlebar"
                        onPointerDown={beginInteraction}
                    >
                        <WrenchIcon />
                        <span className="vc-staff-panel-title">STAFF PANEL</span>
                        <button
                            type="button"
                            className="vc-staff-panel-control"
                            aria-label="Refresh Staff Panel"
                            title="Refresh"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={reloadPanel}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M20 7v5h-5M4 17v-5h5m-4.1-3A7 7 0 0 1 17 6l3 6M4 12l3 6a7 7 0 0 0 12.1-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="vc-staff-panel-control"
                            aria-label={isExpanded ? "Restore Staff Panel size" : "Expand Staff Panel"}
                            title={isExpanded ? "Restore" : "Expand"}
                            onPointerDown={event => event.stopPropagation()}
                            onClick={toggleExpanded}
                        >
                            {isExpanded ? (
                                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m11-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            )}
                        </button>
                        <button
                            type="button"
                            className="vc-staff-panel-control"
                            aria-label="Previous page"
                            title="Previous page"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => navigateHistory("back")}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M19 12H5m0 0 7 7m-7-7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="vc-staff-panel-control"
                            aria-label="Next page"
                            title="Next page"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => navigateHistory("forward")}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M5 12h14m0 0-7-7m7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="vc-staff-panel-control vc-staff-panel-close"
                            aria-label="Minimize Staff Panel"
                            title="Minimize"
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => setPanelVisible(false)}
                        >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M5 11h14v2H5z" fill="currentColor" />
                            </svg>
                        </button>
                    </header>
                    {loading && !error && (
                        <div className="vc-staff-panel-error" role="status">
                            <span>Loading Staff Panel...</span>
                        </div>
                    )}
                    {error && (
                        <div className="vc-staff-panel-error" role="alert">
                            <span>Could not load the Staff Panel.</span>
                            <span>{error}</span>
                        </div>
                    )}
                </section>,
                document.body
            )}
        </div>
    );
}

export default definePlugin({
    name: "StaffPanel",
    description: "Adds a draggable staff panel.",
    authors: [Devs.Stellaros],
    tags: ["Utility"],
    enabledByDefault: true,
    settings,
    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            predicate: () => !IS_WEB,
            replacement: {
                match: /(trailing:.{0,50}?(?:\i\.Fragment|\$self\.TrailingWrapper),\{children:\[)/,
                replace: "$1Vencord.Webpack.Common.React.createElement($self.StaffPanelWidget),"
            }
        }
    ],

    StaffPanelWidget() {
        return (
            <ErrorBoundary key="vc-staff-panel" noop>
                <StaffPanelWidget />
            </ErrorBoundary>
        );
    },

});
