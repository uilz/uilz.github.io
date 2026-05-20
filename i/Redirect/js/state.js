const ROOT_INSIGHT_ID = "root_insight";
const ROOT_ACTION_ID = "root_action";
const VERSION = "1.0.0";

const clone = value => {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

class GraphState {
    constructor() {
        this.subscribers = new Set();
        this.reset();
    }

    reset() {
        const createdDate = new Date();
        const now = createdDate.toISOString();
        this.state = {
            version: VERSION,
            metadata: this.createMetadata({
                created_at: now,
                created_stamp: formatStamp(createdDate),
                last_updated: now,
                mind_type: "daily"
            }),
            graph: {
                nodes: [
                    {
                        id: ROOT_INSIGHT_ID,
                        content: "\uD83D\uDC8E Insights",
                        isRoot: true,
                        parent: null,
                        position: { x: 200, y: 400 }
                    },
                    {
                        id: ROOT_ACTION_ID,
                        content: "\uD83D\uDE80 Actions",
                        isRoot: true,
                        parent: null,
                        position: { x: 600, y: 400 }
                    }
                ],
                links: []
            },
            viewState: {
                pan: { x: 0, y: 0 },
                zoom: 1
            }
        };
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    notify() {
        this.state.metadata.last_updated = new Date().toISOString();
        const snapshot = this.getState();
        for (const callback of this.subscribers) {
            callback(snapshot);
        }
    }

    getState() {
        return clone(this.state);
    }

    setState(newState) {
        this.state = clone(newState);
        this.notify();
    }

    loadFromData(rawData) {
        if (!rawData || typeof rawData !== "object") {
            throw new Error("Invalid graph data payload");
        }
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const rawMetadata = rawData.metadata ?? {};
        const storedLastUpdated = normalizeIso(rawMetadata.last_updated ?? rawMetadata.lastUpdated);
        const merged = {
            version: rawData.version ?? VERSION,
            metadata: this.createMetadata({
                created_at: now,
                created_stamp: formatStamp(nowDate),
                last_updated: storedLastUpdated ?? now,
                mind_type: sanitizeTypeLabel(rawMetadata.mind_type ?? rawMetadata.type) ?? "daily"
            }),
            graph: {
                nodes: Array.isArray(rawData.graph?.nodes) ? rawData.graph.nodes : [],
                links: Array.isArray(rawData.graph?.links) ? rawData.graph.links : []
            },
            viewState: rawData.viewState ?? { pan: { x: 0, y: 0 }, zoom: 1 }
        };
        const rootIds = new Set([ROOT_INSIGHT_ID, ROOT_ACTION_ID]);
        const hasInsight = merged.graph.nodes.some(node => node.id === ROOT_INSIGHT_ID);
        const hasAction = merged.graph.nodes.some(node => node.id === ROOT_ACTION_ID);
        if (!hasInsight) {
            merged.graph.nodes.unshift({
                id: ROOT_INSIGHT_ID,
                content: "\uD83D\uDC8E Insights",
                isRoot: true,
                parent: null,
                position: { x: 200, y: 400 }
            });
        }
        if (!hasAction) {
            merged.graph.nodes.push({
                id: ROOT_ACTION_ID,
                content: "\uD83D\uDE80 Actions",
                isRoot: true,
                parent: null,
                position: { x: 600, y: 400 }
            });
        }
        merged.graph.nodes = merged.graph.nodes.map(node => ({
            id: String(node.id),
            parent: node.isRoot ? null : (node.parent ?? null),
            content: String(node.content ?? ""),
            isRoot: Boolean(node.isRoot),
            position: {
                x: Number(node.position?.x ?? 0),
                y: Number(node.position?.y ?? 0)
            }
        }));
        merged.graph.links = merged.graph.links
            .filter(link => link.source && link.target)
            .map(link => ({
                id: String(link.id ?? this.createId("link")),
                source: String(link.source),
                target: String(link.target),
                label: link.label != null ? String(link.label) : ""
            }));
        this.state = merged;
        this.notify();
    }

    createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    addNode(parentId, content = "New node", positionOverride = null) {
        const parent = this.state.graph.nodes.find(node => node.id === parentId);
        if (!parent) {
            throw new Error(`Parent node ${parentId} not found`);
        }
        const newNode = {
            id: this.createId("node"),
            parent: parent.id,
            content,
            isRoot: false,
            position: {
                x: Number(positionOverride?.x ?? parent.position.x + 80),
                y: Number(positionOverride?.y ?? parent.position.y - 80)
            }
        };
        this.state.graph.nodes.push(newNode);
        this.notify();
        return newNode.id;
    }

    removeNode(nodeId) {
        const node = this.state.graph.nodes.find(n => n.id === nodeId);
        if (!node || node.isRoot) {
            return false;
        }

        const descendants = new Set([nodeId]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const candidate of this.state.graph.nodes) {
                if (!descendants.has(candidate.id) && descendants.has(candidate.parent)) {
                    descendants.add(candidate.id);
                    changed = true;
                }
            }
        }

        this.state.graph.nodes = this.state.graph.nodes.filter(n => !descendants.has(n.id));
        this.state.graph.links = this.state.graph.links.filter(link => !descendants.has(link.source) && !descendants.has(link.target));
        this.notify();
        return true;
    }

    updateNodeContent(nodeId, newContent) {
        const node = this.state.graph.nodes.find(n => n.id === nodeId);
        if (!node) {
            return false;
        }
        node.content = newContent;
        this.notify();
        return true;
    }

    updateNodePosition(nodeId, position, options = {}) {
        const { silent = false } = options;
        const node = this.state.graph.nodes.find(n => n.id === nodeId);
        if (!node) {
            return false;
        }
        node.position = { x: position.x, y: position.y };
        if (!silent) {
            this.notify();
        }
        return true;
    }

    setViewState(viewState) {
        this.state.viewState = {
            pan: {
                x: Number(viewState.pan?.x ?? 0),
                y: Number(viewState.pan?.y ?? 0)
            },
            zoom: Number(viewState.zoom ?? 1)
        };
        this.notify();
    }

    addLink(sourceId, targetId, label = "") {
        if (sourceId === targetId) {
            return null;
        }
        const sourceExists = this.state.graph.nodes.some(n => n.id === sourceId);
        const targetExists = this.state.graph.nodes.some(n => n.id === targetId);
        if (!sourceExists || !targetExists) {
            return null;
        }
        const already = this.state.graph.links.some(link => link.source === sourceId && link.target === targetId);
        if (already) {
            return null;
        }
        const newLink = {
            id: this.createId("link"),
            source: sourceId,
            target: targetId,
            label
        };
        this.state.graph.links.push(newLink);
        this.notify();
        return newLink.id;
    }

    toggleLink(sourceId, targetId, label = "") {
        if (sourceId === targetId) {
            return { status: "failed" };
        }
        const matches = this.state.graph.links.filter(link => (
            (link.source === sourceId && link.target === targetId) ||
            (link.source === targetId && link.target === sourceId)
        ));
        if (matches.length) {
            const idsToRemove = new Set(matches.map(link => link.id));
            const before = this.state.graph.links.length;
            this.state.graph.links = this.state.graph.links.filter(link => !idsToRemove.has(link.id));
            if (this.state.graph.links.length !== before) {
                this.notify();
            }
            return { status: "removed", linkIds: [...idsToRemove] };
        }
        const newId = this.addLink(sourceId, targetId, label);
        if (!newId) {
            return { status: "failed" };
        }
        return { status: "added", linkId: newId };
    }

    removeLink(linkId) {
        const before = this.state.graph.links.length;
        this.state.graph.links = this.state.graph.links.filter(link => link.id !== linkId);
        if (this.state.graph.links.length !== before) {
            this.notify();
            return true;
        }
        return false;
    }

    setMindType(type) {
        const sanitized = sanitizeTypeLabel(type) ?? "daily";
        if (this.state.metadata.mind_type === sanitized) {
            return;
        }
        this.state.metadata.mind_type = sanitized;
        this.notify();
    }

    getMindType() {
        return this.state.metadata?.mind_type ?? "daily";
    }

    createMetadata(overrides = {}) {
        const now = new Date();
        const base = {
            created_at: now.toISOString(),
            created_stamp: formatStamp(now),
            last_updated: now.toISOString(),
            mind_type: "daily"
        };
        return { ...base, ...overrides };
    }
}

export const graphState = new GraphState();
export { ROOT_INSIGHT_ID, ROOT_ACTION_ID };

function normalizeIso(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

function formatStamp(date) {
    const pad = (num, size = 2) => String(num).padStart(size, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeStamp(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return /^\d{8}-\d{6}$/.test(trimmed) ? trimmed : null;
}

function sanitizeTypeLabel(value) {
    if (typeof value !== "string" || !value.trim()) {
        return "daily";
    }
    const cleaned = value.trim().toLowerCase().replace(/[^a-z]/g, "");
    return cleaned || "daily";
}
