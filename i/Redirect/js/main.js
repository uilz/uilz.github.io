import { graphState } from "./state.js";
import { Renderer } from "./renderer.js";
import { InteractionHandler } from "./interactions.js";
import { IOHandler } from "./io.js";
import { UIControls } from "./ui.js";

class GenesisMindApp {
    constructor() {
        this.state = graphState;
        this.svg = document.getElementById("graph-canvas");
        this.contextMenu = document.getElementById("context-menu");
        this.uiLayer = document.getElementById("ui-layer");

        this.renderer = new Renderer(this.svg, this.state);
        this.io = new IOHandler(this.state);
        this.interactions = new InteractionHandler(this.renderer, {
            state: this.state,
            contextMenu: this.contextMenu
        });
        this.ui = new UIControls({
            container: this.uiLayer,
            ioHandler: this.io,
            state: this.state,
            interactions: this.interactions
        });
    }
}

class ModeController {
    constructor(appInstance) {
        this.app = appInstance;
        this.workspace = document.getElementById("workspace");
        this.modeButtons = document.querySelectorAll(".mode-button[data-mode]");
        this.importButton = document.getElementById("comparison-import-button");
        this.fileInput = document.getElementById("comparison-file-input");
        this.listContainer = document.getElementById("comparison-list");
        this.panel = document.getElementById("comparison-panel");
        this.panelToggle = document.getElementById("comparison-collapse-toggle");
        this.panelBody = document.getElementById("comparison-panel-body");
        this.smallScreenQuery = window.matchMedia("(max-width: 768px)");
        this.panelCollapsed = this.smallScreenQuery.matches;
        this.records = [];
        this.currentMode = "free";
        this.bindEvents();
        this.setupResponsivePanel();
        this.setMode("free");
    }

    bindEvents() {
        this.modeButtons.forEach(button => {
            button.addEventListener("click", () => {
                const mode = button.dataset.mode;
                this.setMode(mode);
            });
        });

        if (this.importButton && this.fileInput) {
            this.importButton.addEventListener("click", () => this.fileInput.click());
            this.fileInput.addEventListener("change", event => {
                const { files } = event.target;
                this.handleBatchImport(files);
                event.target.value = "";
            });
        }

        if (this.listContainer) {
            this.listContainer.addEventListener("click", event => {
                const button = event.target.closest?.("button[data-action='load-record']");
                if (!button) {
                    return;
                }
                const recordId = button.dataset.recordId;
                this.loadRecord(recordId);
            });
        }
    }

    setMode(nextMode) {
        const resolvedMode = nextMode === "compare" ? "compare" : "free";
        this.currentMode = resolvedMode;
        if (this.workspace) {
            this.workspace.classList.toggle("workspace--compare", resolvedMode === "compare");
            this.workspace.classList.toggle("workspace--free", resolvedMode === "free");
        }
        this.modeButtons.forEach(button => {
            const isActive = button.dataset.mode === resolvedMode;
            button.setAttribute("aria-pressed", String(isActive));
        });
        if (resolvedMode === "compare" && this.smallScreenQuery.matches) {
            this.panelCollapsed = true;
        } else if (resolvedMode === "free") {
            this.panelCollapsed = false;
        }
        this.updatePanelCollapseState();
    }

    async handleBatchImport(fileList) {
        const files = Array.from(fileList ?? []);
        if (!files.length) {
            return;
        }
        const imported = [];
        for (const file of files) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                imported.push(this.buildRecord(file, data));
            } catch (error) {
                console.error("Failed to import", file.name, error);
                alert(`无法解析文件: ${file.name}`);
            }
        }
        if (!imported.length) {
            return;
        }
        this.records = [...imported, ...this.records];
        this.renderRecords();
        if (this.currentMode !== "compare") {
            this.setMode("compare");
        }
    }

    buildRecord(file, data) {
        const metadata = data?.metadata ?? {};
        const nodes = Array.isArray(data?.graph?.nodes) ? data.graph.nodes.length : 0;
        const links = Array.isArray(data?.graph?.links) ? data.graph.links.length : 0;
        return {
            id: `record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            size: file.size,
            importedAt: new Date().toISOString(),
            data,
            summary: {
                type: metadata.mind_type ?? metadata.mindType ?? "daily",
                created: metadata.created_at ?? metadata.createdAt ?? null,
                updated: metadata.last_updated ?? metadata.lastUpdated ?? null,
                nodes,
                links
            }
        };
    }

    renderRecords() {
        if (!this.listContainer) {
            return;
        }
        this.listContainer.innerHTML = "";
        if (!this.records.length) {
            this.listContainer.appendChild(this.createEmptyState());
            return;
        }
        const fragment = document.createDocumentFragment();
        this.records.forEach(record => {
            fragment.appendChild(this.createCard(record));
        });
        this.listContainer.appendChild(fragment);
    }

    createEmptyState() {
        const wrapper = document.createElement("div");
        wrapper.className = "empty-state";
        const title = document.createElement("p");
        title.textContent = "暂无导入记录。";
        const hint = document.createElement("small");
        hint.textContent = "点击“批量导入”选择多个 *.json 文件。";
        wrapper.append(title, hint);
        return wrapper;
    }

    createCard(record) {
        const card = document.createElement("div");
        card.className = "comparison-card";

        const title = document.createElement("h3");
        title.textContent = record.name;
        card.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "comparison-meta";
        meta.append(
            this.metaItem(`类型: ${record.summary.type}`),
            this.metaItem(`节点: ${record.summary.nodes}`),
            this.metaItem(`连线: ${record.summary.links}`),
            this.metaItem(`创建: ${this.formatDate(record.summary.created)}`),
            this.metaItem(`更新: ${this.formatDate(record.summary.updated)}`),
            this.metaItem(`大小: ${(record.size / 1024).toFixed(1)} KB`)
        );
        card.appendChild(meta);

        const action = document.createElement("button");
        action.className = "ui-button";
        action.dataset.action = "load-record";
        action.dataset.recordId = record.id;
        action.textContent = "加载到左侧";
        card.appendChild(action);

        return card;
    }

    metaItem(text) {
        const span = document.createElement("span");
        span.textContent = text;
        return span;
    }

    formatDate(value) {
        if (!value) {
            return "--";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    loadRecord(recordId) {
        const target = this.records.find(record => record.id === recordId);
        if (!target) {
            return;
        }
        try {
            this.app?.state?.loadFromData(target.data);
            this.app?.interactions?.clearSelection?.();
        } catch (error) {
            console.error("Failed to load record", recordId, error);
            alert("无法加载该记录，请检查文件内容。");
        }
    }

    setupResponsivePanel() {
        if (!this.panelToggle || !this.panel) {
            return;
        }
        this.panelToggle.addEventListener("click", () => {
            if (!this.smallScreenQuery.matches || this.currentMode !== "compare") {
                return;
            }
            this.panelCollapsed = !this.panelCollapsed;
            this.updatePanelCollapseState();
        });

        const handleMediaChange = event => {
            if (!event.matches) {
                this.panelCollapsed = false;
            } else if (this.currentMode === "compare") {
                this.panelCollapsed = true;
            }
            this.updatePanelCollapseState();
        };
        if (typeof this.smallScreenQuery.addEventListener === "function") {
            this.smallScreenQuery.addEventListener("change", handleMediaChange);
        } else if (typeof this.smallScreenQuery.addListener === "function") {
            this.smallScreenQuery.addListener(handleMediaChange);
        }
        this.updatePanelCollapseState();
    }

    updatePanelCollapseState() {
        if (!this.panel || !this.panelToggle) {
            return;
        }
        const forceExpanded = !this.smallScreenQuery.matches;
        const collapsed = forceExpanded ? false : this.panelCollapsed;
        this.panel.dataset.collapsed = String(collapsed);
        this.panelToggle.setAttribute("aria-expanded", String(!collapsed));
        this.panelToggle.textContent = collapsed ? "展开面板" : "收起面板";
        this.panelToggle.tabIndex = forceExpanded ? -1 : 0;
        this.panelToggle.setAttribute("aria-hidden", forceExpanded ? "true" : "false");
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const app = new GenesisMindApp();
    window.genesisMind = app;
    new ModeController(app);
});
