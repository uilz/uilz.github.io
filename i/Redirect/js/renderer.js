const SVG_NS = "http://www.w3.org/2000/svg";

export class Renderer {
    constructor(svgElement, state) {
        this.svg = svgElement;
        this.state = state;
        this.dimensions = { width: 0, height: 0 };
        this.view = { pan: { x: 0, y: 0 }, zoom: 1 };
        this.elementsCallback = null;
        this.selectedNodeId = null;
        this.latestNodeElements = new Map();
        this.nodePositions = new Map();
        this.primaryLinkMap = new Map();
        this.assocLinkMap = new Map();
        this.linkLabelMap = new Map();

        this.setupSvg();
        this.attachResizeObserver();
        this.attachCanvasInteractions();

        this.unsubscribe = this.state.subscribe(snapshot => {
            this.onStateChange(snapshot);
        });
        this.onStateChange(this.state.getState());
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    setupSvg() {
        this.svg.setAttribute("viewBox", "0 0 1200 800");
        this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        this.svg.classList.add("render-ready");

        this.rootGroup = document.createElementNS(SVG_NS, "g");
        this.primaryLinkGroup = document.createElementNS(SVG_NS, "g");
        this.primaryLinkGroup.classList.add("primary-links");
        this.assoLinkGroup = document.createElementNS(SVG_NS, "g");
        this.assoLinkGroup.classList.add("association-links");
        this.linkLabelGroup = document.createElementNS(SVG_NS, "g");
        this.nodesGroup = document.createElementNS(SVG_NS, "g");

        this.rootGroup.appendChild(this.primaryLinkGroup);
        this.rootGroup.appendChild(this.assoLinkGroup);
        this.rootGroup.appendChild(this.linkLabelGroup);
        this.rootGroup.appendChild(this.nodesGroup);
        this.svg.appendChild(this.rootGroup);
    }

    attachResizeObserver() {
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.target === this.svg) {
                    const { width, height } = entry.contentRect;
                    this.dimensions = { width, height };
                }
            }
        });
        observer.observe(this.svg);
        this.resizeObserver = observer;
    }

    attachCanvasInteractions() {
        let panning = false;
        let panPointerId = null;
        let last = { x: 0, y: 0 };
        const pinch = {
            active: false,
            pointers: new Map(),
            startDistance: 0,
            startZoom: 1,
            anchor: { x: 0, y: 0 }
        };

        const beginPan = event => {
            panning = true;
            panPointerId = event.pointerId;
            last = { x: event.clientX, y: event.clientY };
            this.svg.setPointerCapture(event.pointerId);
            this.svg.classList.add("dragging");
        };

        const updatePan = event => {
            if (!panning || event.pointerId !== panPointerId) {
                return;
            }
            const dx = event.clientX - last.x;
            const dy = event.clientY - last.y;
            last = { x: event.clientX, y: event.clientY };
            this.view.pan.x += dx;
            this.view.pan.y += dy;
            this.applyViewTransform();
            this.state.setViewState(this.view);
        };

        const stopPan = pointerId => {
            if (!panning || pointerId !== panPointerId) {
                return;
            }
            panning = false;
            panPointerId = null;
            this.svg.releasePointerCapture(pointerId);
            this.svg.classList.remove("dragging");
        };

        const startPinch = () => {
            if (pinch.pointers.size !== 2) {
                return;
            }
            pinch.active = true;
            if (panning && panPointerId != null) {
                stopPan(panPointerId);
            }
            const [a, b] = [...pinch.pointers.values()];
            pinch.startDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            pinch.startZoom = this.view.zoom;
            const rect = this.svg.getBoundingClientRect();
            pinch.anchor = {
                x: ((a.x + b.x) / 2) - rect.left,
                y: ((a.y + b.y) / 2) - rect.top
            };
        };

        const updatePinch = () => {
            if (!pinch.active || pinch.pointers.size < 2) {
                return;
            }
            const [a, b] = [...pinch.pointers.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const factor = distance / pinch.startDistance;
            this.applyZoomAtPoint(pinch.startZoom * factor, pinch.anchor.x, pinch.anchor.y);
        };

        const endPinch = () => {
            if (!pinch.active) {
                return;
            }
            pinch.active = false;
            pinch.startDistance = 0;
        };

        this.svg.addEventListener("pointerdown", event => {
            const isTouch = event.pointerType === "touch";
            if (isTouch) {
                if (!pinch.pointers.has(event.pointerId) && pinch.pointers.size < 2) {
                    pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    if (pinch.pointers.size === 2) {
                        startPinch();
                        return;
                    }
                }
                if (pinch.active) {
                    return;
                }
            }
            if (event.button !== 0) {
                return;
            }
            if (event.target !== this.svg) {
                return;
            }
            beginPan(event);
        });

        this.svg.addEventListener("pointermove", event => {
            if (event.pointerType === "touch" && pinch.pointers.has(event.pointerId)) {
                pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pinch.active) {
                    updatePinch();
                    return;
                }
            }
            updatePan(event);
        });

        const handlePointerEnd = event => {
            if (event.pointerType === "touch" && pinch.pointers.has(event.pointerId)) {
                pinch.pointers.delete(event.pointerId);
                if (pinch.active && pinch.pointers.size < 2) {
                    endPinch();
                }
            }
            stopPan(event.pointerId);
        };

        this.svg.addEventListener("pointerup", handlePointerEnd);
        this.svg.addEventListener("pointercancel", handlePointerEnd);

        this.svg.addEventListener("wheel", event => {
            event.preventDefault();
            const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
            const rect = this.svg.getBoundingClientRect();
            const cx = event.clientX - rect.left;
            const cy = event.clientY - rect.top;
            this.applyZoomAtPoint(this.view.zoom * zoomFactor, cx, cy);
        }, { passive: false });
    }

    onStateChange(snapshot) {
        if (snapshot.viewState) {
            this.view = {
                pan: { ...snapshot.viewState.pan },
                zoom: snapshot.viewState.zoom
            };
            this.applyViewTransform();
        }
        this.render(snapshot);
    }

    buildPrimaryLinks(nodes) {
        const links = [];
        for (const node of nodes) {
            if (node.parent) {
                links.push({ source: node.parent, target: node.id });
            }
        }
        return links;
    }

    applyViewTransform() {
        const { x, y } = this.view.pan;
        const scale = this.view.zoom;
        this.rootGroup.setAttribute("transform", `translate(${x},${y}) scale(${scale})`);
    }

    applyZoomAtPoint(targetZoom, cx, cy) {
        const clamped = Math.min(2.5, Math.max(0.4, targetZoom));
        const scaleRatio = clamped / this.view.zoom;
        this.view.pan.x = cx - (cx - this.view.pan.x) * scaleRatio;
        this.view.pan.y = cy - (cy - this.view.pan.y) * scaleRatio;
        this.view.zoom = clamped;
        this.applyViewTransform();
        this.state.setViewState(this.view);
    }

    render(snapshot) {
        this.primaryLinkGroup.innerHTML = "";
        this.assoLinkGroup.innerHTML = "";
        this.linkLabelGroup.innerHTML = "";
        this.nodesGroup.innerHTML = "";
        this.primaryLinkMap.clear();
        this.assocLinkMap.clear();
        this.linkLabelMap.clear();
        this.nodePositions.clear();

        const nodesById = new Map(snapshot.graph.nodes.map(node => [node.id, node]));
        const primaryLinks = this.buildPrimaryLinks(snapshot.graph.nodes);

        const register = (map, key, payload) => {
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(payload);
        };

        for (const link of primaryLinks) {
            const source = nodesById.get(link.source);
            const target = nodesById.get(link.target);
            if (!source || !target) {
                continue;
            }
            const path = document.createElementNS(SVG_NS, "path");
            path.classList.add("primary-link");
            path.dataset.source = source.id;
            path.dataset.target = target.id;
            const segment = this.computeSegment(source.position, target.position);
            path.setAttribute("d", this.createCurvePath(segment.start, segment.end));
            this.primaryLinkGroup.appendChild(path);
            register(this.primaryLinkMap, source.id, { path, source: source.id, target: target.id });
            register(this.primaryLinkMap, target.id, { path, source: source.id, target: target.id });
        }

        for (const link of snapshot.graph.links) {
            const source = nodesById.get(link.source);
            const target = nodesById.get(link.target);
            if (!source || !target) {
                continue;
            }
            const path = document.createElementNS(SVG_NS, "path");
            path.classList.add("association-link");
            path.dataset.linkId = link.id;
            path.dataset.source = link.source;
            path.dataset.target = link.target;
            const segment = this.computeSegment(source.position, target.position);
            path.setAttribute("d", this.createCurvePath(segment.start, segment.end));
            this.assoLinkGroup.appendChild(path);
            register(this.assocLinkMap, link.source, { path, linkId: link.id, source: link.source, target: link.target, label: link.label });
            register(this.assocLinkMap, link.target, { path, linkId: link.id, source: link.source, target: link.target, label: link.label });

            if (link.label) {
                const label = document.createElementNS(SVG_NS, "text");
                label.classList.add("link-label");
                const mid = this.midPoint(segment.start, segment.end);
                label.setAttribute("x", String(mid.x));
                label.setAttribute("y", String(mid.y));
                label.textContent = link.label;
                this.linkLabelGroup.appendChild(label);
                this.linkLabelMap.set(link.id, {
                    element: label,
                    source: link.source,
                    target: link.target
                });
            }
        }

        const nodeElements = new Map();
        for (const node of snapshot.graph.nodes) {
            const group = document.createElementNS(SVG_NS, "g");
            group.classList.add("graph-node");
            if (node.isRoot) {
                group.classList.add("node-root");
            }
            if (node.id === this.selectedNodeId) {
                group.classList.add("node-selected");
            }
            group.dataset.nodeId = node.id;
            group.setAttribute("transform", `translate(${node.position.x},${node.position.y})`);

            const rect = document.createElementNS(SVG_NS, "rect");
            rect.classList.add("node-rect");
            rect.setAttribute("x", -110);
            rect.setAttribute("y", -40);
            rect.setAttribute("width", "220");
            rect.setAttribute("height", "80");
            group.appendChild(rect);

            const foreign = document.createElementNS(SVG_NS, "foreignObject");
            foreign.setAttribute("class", "node-foreign");
            foreign.setAttribute("x", -105);
            foreign.setAttribute("y", -35);
            foreign.setAttribute("width", "210");
            foreign.setAttribute("height", "70");

            const container = document.createElement("div");
            container.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
            container.textContent = node.content;
            container.className = "node-content";
            container.style.fontSize = "0.9rem";
            container.style.lineHeight = "1.35";
            container.style.color = "inherit";
            container.style.whiteSpace = "pre-wrap";
            container.style.wordBreak = "break-word";
            container.style.overflowWrap = "anywhere";
            container.style.pointerEvents = "none";
            foreign.appendChild(container);

            group.appendChild(foreign);
            this.nodesGroup.appendChild(group);
            nodeElements.set(node.id, group);
            this.nodePositions.set(node.id, { ...node.position });
        }

        this.latestNodeElements = nodeElements;

        if (this.elementsCallback) {
            this.elementsCallback({
                nodes: nodeElements,
                svg: this.svg,
                view: this.view
            });
        }
    }

    createCurvePath(source, target) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const norm = Math.hypot(dx, dy) || 1;
        const offsetX = (-dy / norm) * 30;
        const offsetY = (dx / norm) * 30;
        const c1x = midX + offsetX;
        const c1y = midY + offsetY;
        return `M ${source.x} ${source.y} Q ${c1x} ${c1y} ${target.x} ${target.y}`;
    }

    midPoint(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    setElementsCallback(callback) {
        this.elementsCallback = callback;
        if (typeof callback === "function" && this.latestNodeElements?.size) {
            callback({
                nodes: this.latestNodeElements,
                svg: this.svg,
                view: this.view
            });
        }
    }

    setSelectedNode(nodeId) {
        this.selectedNodeId = nodeId;
        for (const [id, element] of this.latestNodeElements.entries()) {
            if (id === nodeId) {
                element.classList.add("node-selected");
            } else {
                element.classList.remove("node-selected");
            }
        }
    }

    updateNodePositionVisual(nodeId, position) {
        const element = this.latestNodeElements.get(nodeId);
        if (element) {
            element.setAttribute("transform", `translate(${position.x},${position.y})`);
        }
        this.nodePositions.set(nodeId, { ...position });

        const updatePaths = (entriesMap) => {
            const entries = entriesMap.get(nodeId) ?? [];
            for (const entry of entries) {
                const sourcePos = this.nodePositions.get(entry.source);
                const targetPos = this.nodePositions.get(entry.target);
                if (!sourcePos || !targetPos) {
                    continue;
                }
                const segment = this.computeSegment(sourcePos, targetPos);
                entry.path.setAttribute("d", this.createCurvePath(segment.start, segment.end));
                if (entry.linkId) {
                    const labelMeta = this.linkLabelMap.get(entry.linkId);
                    if (labelMeta) {
                        const mid = this.midPoint(segment.start, segment.end);
                        labelMeta.element.setAttribute("x", String(mid.x));
                        labelMeta.element.setAttribute("y", String(mid.y));
                    }
                }
            }
        };

        updatePaths(this.primaryLinkMap);
        updatePaths(this.assocLinkMap);
    }

    computeSegment(sourcePos, targetPos) {
        const start = this.anchorFromCenter(sourcePos, targetPos);
        const end = this.anchorFromCenter(targetPos, sourcePos);
        return { start, end };
    }

    anchorFromCenter(center, toward) {
        const dx = toward.x - center.x;
        const dy = toward.y - center.y;
        if (!dx && !dy) {
            return { ...center };
        }
        const halfW = 110;
        const halfH = 40;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let scale;
        if (absDx === 0) {
            scale = halfH / absDy;
        } else if (absDy === 0) {
            scale = halfW / absDx;
        } else {
            scale = Math.min(halfW / absDx, halfH / absDy);
        }
        scale = Math.min(scale, 1);
        const intersection = {
            x: center.x + dx * scale,
            y: center.y + dy * scale
        };
        const length = Math.hypot(dx, dy) || 1;
        const margin = 6;
        return {
            x: intersection.x - (dx / length) * margin,
            y: intersection.y - (dy / length) * margin
        };
    }

    createNodeToPointPath(nodePos, point) {
        const start = this.anchorFromCenter(nodePos, point);
        return this.createCurvePath(start, point);
    }

    getContentBounds() {
        const nodes = this.state.getState().graph.nodes;
        if (nodes.length === 0) {
            return { x: 0, y: 0, width: 1200, height: 800 };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const halfW = 110;
        const halfH = 40;

        nodes.forEach(node => {
            minX = Math.min(minX, node.position.x - halfW);
            maxX = Math.max(maxX, node.position.x + halfW);
            minY = Math.min(minY, node.position.y - halfH);
            maxY = Math.max(maxY, node.position.y + halfH);
        });

        // Add some padding
        const padding = 50;
        return {
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + (padding * 2),
            height: (maxY - minY) + (padding * 2)
        };
    }

    clientPointToGraph(clientX, clientY) {
        if (!this.rootGroup) {
            return { x: clientX, y: clientY };
        }
        const pt = this.svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        const ctm = this.rootGroup.getScreenCTM();
        if (!ctm) {
            return { x: clientX, y: clientY };
        }
        const inverted = ctm.inverse();
        const transformed = pt.matrixTransform(inverted);
        return { x: transformed.x, y: transformed.y };
    }
}
