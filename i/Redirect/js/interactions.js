import { graphState } from "./state.js";

const MENU_TYPE = {
    NODE: "node",
    CANVAS: "canvas"
};

export class InteractionHandler {
    constructor(renderer, options = {}) {
        this.renderer = renderer;
        this.state = options.state ?? graphState;
        this.contextMenu = options.contextMenu;
        this.linking = { active: false, sourceId: null, line: null };
        this.drag = null;
        this.currentNodes = new Map();
        this.pendingInlineEditId = null;
        this.selectionListeners = new Set();
        this.linkingListeners = new Set();
        this.touchTapTracker = { nodeId: null, lastTime: 0 };
        this.canvasTapTracker = { lastTime: 0 };

        this.renderer.setElementsCallback(payload => {
            this.currentNodes = payload.nodes;
            this.bindNodeInteractions();
            this.flushPendingInlineEditor();
        });

        this.svg = this.renderer.svg;
        this.bindGlobalEvents();
    }

    bindGlobalEvents() {
        window.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                this.cancelLinking();
                this.hideContextMenu();
            }
        });

        this.svg.addEventListener("click", () => {
            this.hideContextMenu();
        });

        this.svg.addEventListener("contextmenu", event => {
            if (event.target.closest && event.target.closest(".graph-node")) {
                return;
            }
            event.preventDefault();
            this.showContextMenu({ x: event.clientX, y: event.clientY }, MENU_TYPE.CANVAS);
        });

        const handlePointerMove = event => {
            if (this.linking.active && this.linking.line) {
                const source = this.state.getState().graph.nodes.find(n => n.id === this.linking.sourceId);
                if (source) {
                    const target = this.pointerToGraph(event.clientX, event.clientY);
                    this.linking.line.setAttribute("d", this.renderer.createNodeToPointPath(source.position, target));
                }
            }
            if (this.drag && event.pointerId === this.drag.pointerId) {
                const graphPos = this.pointerToGraph(event.clientX, event.clientY);
                const offset = this.drag.offset ?? { dx: 0, dy: 0 };
                const nextPosition = {
                    x: graphPos.x + offset.dx,
                    y: graphPos.y + offset.dy
                };
                this.drag.latest = nextPosition;
                this.state.updateNodePosition(this.drag.nodeId, nextPosition, { silent: true });
                this.renderer.updateNodePositionVisual(this.drag.nodeId, nextPosition);
            }
        };
        window.addEventListener("pointermove", handlePointerMove);

        const endDrag = event => {
            if (!this.drag || (event.pointerId != null && event.pointerId !== this.drag.pointerId)) {
                return;
            }
            if (this.drag.latest) {
                this.state.updateNodePosition(this.drag.nodeId, this.drag.latest);
            }
            this.drag = null;
        };

        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);

        const handleBlankActivate = (clientX, clientY) => {
            const parentId = this.ensureSelectableNode();
            if (!parentId) {
                return;
            }
            const graphPos = this.pointerToGraph(clientX, clientY);
            const newId = this.state.addNode(parentId, "New node", graphPos);
            this.selectNode(newId);
            this.queueInlineEditor(newId);
        };

        this.svg.addEventListener("dblclick", event => {
            const nodeTarget = event.target.closest?.(".graph-node");
            if (nodeTarget) {
                return;
            }
            event.preventDefault();
            handleBlankActivate(event.clientX, event.clientY);
        });

        this.svg.addEventListener("pointerdown", event => {
            if (event.pointerType !== "touch" || event.isPrimary === false) {
                return;
            }
            if (event.target.closest?.(".graph-node")) {
                return;
            }
            const now = performance.now();
            if ((now - this.canvasTapTracker.lastTime) < 320) {
                event.preventDefault();
                handleBlankActivate(event.clientX, event.clientY);
                this.canvasTapTracker.lastTime = 0;
            } else {
                this.canvasTapTracker.lastTime = now;
            }
        });
    }

    bindNodeInteractions() {
        for (const [nodeId, element] of this.currentNodes.entries()) {
            element.style.cursor = "pointer";

            const clickHandler = event => {
                event.stopPropagation();
                this.selectNode(nodeId);
                this.hideContextMenu();
                if (this.linking.active && this.linking.sourceId !== nodeId) {
                    if (typeof this.state.toggleLink === "function") {
                        this.state.toggleLink(this.linking.sourceId, nodeId, "");
                    } else {
                        this.state.addLink(this.linking.sourceId, nodeId, "");
                    }
                    this.cancelLinking();
                }
            };
            this.attach(element, "click", clickHandler, "clickHandler");

            const dblHandler = event => {
                event.stopPropagation();
                this.openInlineEditor(nodeId, element);
            };
            this.attach(element, "dblclick", dblHandler, "dblHandler");

            const ctxHandler = event => {
                event.preventDefault();
                event.stopPropagation();
                this.selectNode(nodeId);
                this.showContextMenu({ x: event.clientX, y: event.clientY }, MENU_TYPE.NODE);
            };
            this.attach(element, "contextmenu", ctxHandler, "ctxHandler");

            const pointerHandler = event => {
                if (event.button !== 0 && event.pointerType !== "touch") {
                    return;
                }
                if (event.pointerType === "touch" && event.isPrimary === false) {
                    return;
                }
                event.stopPropagation();
                if (event.pointerType === "touch") {
                    event.preventDefault();
                }
                if (event.pointerType === "mouse") {
                    this.selectNode(nodeId);
                    if (event.detail === 2) {
                        this.openInlineEditor(nodeId, element);
                        return;
                    }
                }
                const now = performance.now();
                if (event.pointerType === "touch") {
                    if (this.touchTapTracker.nodeId === nodeId && (now - this.touchTapTracker.lastTime) < 320) {
                        event.preventDefault();
                        this.openInlineEditor(nodeId, element);
                        this.touchTapTracker = { nodeId: null, lastTime: 0 };
                        return;
                    }
                    this.touchTapTracker = { nodeId, lastTime: now };
                }
                if (event.button !== 0) {
                    return;
                }
                const state = this.state.getState();
                const node = state.graph.nodes.find(n => n.id === nodeId);
                const pointerGraphPos = this.pointerToGraph(event.clientX, event.clientY);
                const offset = node ? {
                    dx: node.position.x - pointerGraphPos.x,
                    dy: node.position.y - pointerGraphPos.y
                } : { dx: 0, dy: 0 };
                this.drag = {
                    nodeId,
                    latest: null,
                    pointerId: event.pointerId,
                    offset
                };
            };
            this.attach(element, "pointerdown", pointerHandler, "pointerHandler");
        }
    }

    attach(element, eventName, handler, key) {
        if (element[`__${key}`]) {
            element.removeEventListener(eventName, element[`__${key}`]);
        }
        element.addEventListener(eventName, handler);
        element[`__${key}`] = handler;
    }

    selectNode(nodeId) {
        this.renderer.setSelectedNode(nodeId);
        this.selectedNodeId = nodeId;
        this.notifySelection();
    }

    openInlineEditor(nodeId, nodeElement) {
        const snapshot = this.state.getState();
        const node = snapshot.graph.nodes.find(n => n.id === nodeId);
        if (!node) {
            return;
        }
        const foreign = nodeElement.querySelector("foreignObject");
        if (!foreign) {
            return;
        }
        const original = node.content;
        const editor = document.createElement("textarea");
        editor.className = "inline-editor";
        editor.value = original;
        foreign.innerHTML = "";
        foreign.appendChild(editor);
        editor.focus();
        editor.select();

        const commit = () => {
            const next = editor.value.trim();
            this.state.updateNodeContent(nodeId, next || original);
        };

        editor.addEventListener("keydown", event => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                commit();
            }
        });
        editor.addEventListener("blur", commit);
    }

    showContextMenu(point, type) {
        if (!this.contextMenu) {
            return;
        }
        this.hideContextMenu();
        const list = document.createElement("ul");
        if (type === MENU_TYPE.NODE) {
            list.appendChild(this.makeMenuItem("Generate Child Node", () => {
                const newId = this.state.addNode(this.selectedNodeId, "New node");
                this.selectNode(newId);
                this.queueInlineEditor(newId);
                this.hideContextMenu();
            }));
            list.appendChild(this.makeMenuItem("Start Link", () => {
                this.beginLinking(this.selectedNodeId);
                this.hideContextMenu();
            }));
            const node = this.state.getState().graph.nodes.find(n => n.id === this.selectedNodeId);
            const isRoot = node?.isRoot;
            list.appendChild(this.makeMenuItem("Delete Node", () => {
                this.cancelLinkingIfSource(this.selectedNodeId);
                this.state.removeNode(this.selectedNodeId);
                this.hideContextMenu();
            }, isRoot));
        } else {
            const roots = this.state.getState().graph.nodes.filter(n => n.isRoot);
            roots.forEach(root => {
                list.appendChild(this.makeMenuItem(`Add child under ${root.content}`, () => {
                    const newId = this.state.addNode(root.id, "New branch");
                    this.selectNode(newId);
                    this.queueInlineEditor(newId);
                    this.hideContextMenu();
                }));
            });
        }
        this.contextMenu.innerHTML = "";
        this.contextMenu.appendChild(list);
        this.contextMenu.style.left = `${point.x}px`;
        this.contextMenu.style.top = `${point.y}px`;
        this.contextMenu.hidden = false;
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.hidden = true;
            this.contextMenu.innerHTML = "";
        }
    }

    makeMenuItem(label, handler, disabled = false) {
        const item = document.createElement("li");
        item.textContent = label;
        if (disabled) {
            item.setAttribute("aria-disabled", "true");
        } else {
            item.addEventListener("click", () => handler());
        }
        return item;
    }

    beginLinking(sourceId) {
        this.cancelLinking();
        this.linking.active = true;
        this.linking.sourceId = sourceId;
        const tempLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempLine.classList.add("temp-link");
        (this.renderer.rootGroup ?? this.svg).appendChild(tempLine);
        this.linking.line = tempLine;
        const state = this.state.getState();
        const source = state.graph.nodes.find(n => n.id === sourceId);
        if (source) {
            tempLine.setAttribute("d", this.renderer.createNodeToPointPath(source.position, source.position));
        } else {
            tempLine.setAttribute("d", "");
        }
        this.notifyLinking();
    }

    cancelLinking() {
        if (!this.linking.active) {
            return;
        }
        if (this.linking.line?.parentNode) {
            this.linking.line.parentNode.removeChild(this.linking.line);
        }
        this.linking = { active: false, sourceId: null, line: null };
        this.notifyLinking();
    }

    pointerToGraph(clientX, clientY) {
        if (typeof this.renderer.clientPointToGraph === "function") {
            return this.renderer.clientPointToGraph(clientX, clientY);
        }
        const rect = this.svg.getBoundingClientRect();
        const { pan, zoom } = this.renderer.view;
        return {
            x: (clientX - rect.left - pan.x) / zoom,
            y: (clientY - rect.top - pan.y) / zoom
        };
    }

    clearSelection() {
        this.selectedNodeId = null;
        this.renderer.setSelectedNode(null);
        this.notifySelection();
    }

    queueInlineEditor(nodeId) {
        this.pendingInlineEditId = nodeId;
        this.flushPendingInlineEditor();
    }

    flushPendingInlineEditor() {
        if (!this.pendingInlineEditId) {
            return;
        }
        const element = this.currentNodes.get(this.pendingInlineEditId);
        if (!element) {
            return;
        }
        this.openInlineEditor(this.pendingInlineEditId, element);
        this.pendingInlineEditId = null;
    }

    onSelectionChange(callback) {
        this.selectionListeners.add(callback);
        callback(this.selectedNodeId ?? null);
        return () => this.selectionListeners.delete(callback);
    }

    onLinkingChange(callback) {
        this.linkingListeners.add(callback);
        callback(this.linking.active);
        return () => this.linkingListeners.delete(callback);
    }

    notifySelection() {
        for (const callback of this.selectionListeners) {
            callback(this.selectedNodeId ?? null);
        }
    }

    notifyLinking() {
        for (const callback of this.linkingListeners) {
            callback(this.linking.active);
        }
    }

    getSelectedNodeId() {
        return this.selectedNodeId ?? null;
    }

    isLinkingActive() {
        return Boolean(this.linking.active);
    }

    quickAddChild() {
        const parentId = this.ensureSelectableNode();
        if (!parentId) {
            alert("Please select a node first.");
            return;
        }
        const newId = this.state.addNode(parentId, "New node");
        this.selectNode(newId);
        this.queueInlineEditor(newId);
    }

    quickStartLink() {
        const parentId = this.ensureSelectableNode();
        if (!parentId) {
            alert("Please select a node first.");
            return;
        }
        this.beginLinking(parentId);
    }

    quickCancelLink() {
        this.cancelLinking();
    }

    quickDeleteSelected() {
        if (!this.selectedNodeId) {
            alert("Select a non-root node to delete.");
            return;
        }
        const snapshot = this.state.getState();
        const node = snapshot.graph.nodes.find(n => n.id === this.selectedNodeId);
        if (!node || node.isRoot) {
            alert("Root nodes cannot be deleted.");
            return;
        }
        this.cancelLinkingIfSource(this.selectedNodeId);
        this.state.removeNode(this.selectedNodeId);
        this.selectedNodeId = null;
        this.renderer.setSelectedNode(null);
        this.notifySelection();
    }

    ensureSelectableNode() {
        if (this.selectedNodeId) {
            return this.selectedNodeId;
        }
        return this.getDefaultParentId();
    }

    getDefaultParentId() {
        const snapshot = this.state.getState();
        const root = snapshot.graph.nodes.find(node => node.isRoot);
        return root?.id ?? null;
    }

    cancelLinkingIfSource(nodeId) {
        if (this.linking.active && this.linking.sourceId === nodeId) {
            this.cancelLinking();
        }
    }
}
