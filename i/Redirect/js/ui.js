export class UIControls {
    constructor(options) {
        this.container = options.container;
        this.io = options.ioHandler;
        this.state = options.state;
        this.interactions = options.interactions;
        this.buttons = [];
        this.quickButtons = {};
        this.teardownFns = [];
        this.typeOptions = ["daily", "weekly", "monthly", "quarterly", "annually", "decadely"];
        this.typeLabels = {
            daily: "每日", weekly: "每周", monthly: "每月",
            quarterly: "每季", annually: "每年", decadely: "每十年"
        };
        this.currentType = typeof this.state?.getMindType === "function" ? this.state.getMindType() : "daily";
        this.typeSelect = null;
        this.render();
        this.bindInteractionEvents();
        this.bindStateEvents();
    }

    render() {
        if (!this.container) {
            return;
        }
        this.container.innerHTML = "";
        const primaryRow = document.createElement("div");
        primaryRow.className = "ui-row ui-row-primary";
        const typeSelector = this.createTypeSelector();
        primaryRow.appendChild(typeSelector);
        this.buttons = [
            this.createButton("加载", () => this.io.load(), { className: "button-load" }),
            this.createButton("保存", () => this.io.save(this.currentType), { className: "button-save" }),
            this.createButton("导出图片", () => this.io.exportImage(), { className: "button-export" }),
            this.createButton("重置", () => {
                if (confirm("确定要重置为默认状态吗？")) {
                    this.interactions?.cancelLinking?.();
                    this.interactions?.clearSelection?.();
                    this.state.reset();
                    this.state.notify();
                }
            }, { className: "button-reset" })
        ];
        this.buttons.forEach(button => primaryRow.appendChild(button));

        const quickRow = document.createElement("div");
        quickRow.className = "ui-row ui-row-secondary";
        this.quickButtons = {
            addChild: this.createButton("添加节点", () => this.interactions?.quickAddChild()),
            startLink: this.createButton("开始连线", () => this.interactions?.quickStartLink()),
            cancelLink: this.createButton("取消连线", () => this.interactions?.quickCancelLink(), { variant: "outline" }),
            deleteNode: this.createButton("删除节点", () => this.interactions?.quickDeleteSelected(), { variant: "outline" })
        };
        Object.values(this.quickButtons).forEach(button => quickRow.appendChild(button));

        this.container.append(primaryRow, quickRow);
        this.updateButtonStates();
    }

    bindInteractionEvents() {
        if (!this.interactions) {
            return;
        }
        const offSelection = this.interactions.onSelectionChange(() => this.updateButtonStates());
        const offLinking = this.interactions.onLinkingChange(() => this.updateButtonStates());
        this.teardownFns.push(offSelection, offLinking);
    }

    bindStateEvents() {
        if (!this.state?.subscribe) {
            return;
        }
        const unsubscribe = this.state.subscribe(snapshot => {
            const nextType = snapshot?.metadata?.mind_type ?? "daily";
            if (nextType !== this.currentType) {
                this.currentType = nextType;
                this.ensureCustomOption();
                if (this.typeSelect) {
                    this.typeSelect.value = nextType;
                }
            }
        });
        this.teardownFns.push(unsubscribe);
    }

    updateButtonStates() {
        if (!this.interactions || !this.quickButtons) {
            return;
        }
        const hasSelection = Boolean(this.interactions.getSelectedNodeId());
        const linking = this.interactions.isLinkingActive();
        if (this.quickButtons.startLink) {
            this.quickButtons.startLink.disabled = !hasSelection;
        }
        if (this.quickButtons.deleteNode) {
            this.quickButtons.deleteNode.disabled = !hasSelection;
        }
        if (this.quickButtons.cancelLink) {
            this.quickButtons.cancelLink.disabled = !linking;
        }
    }

    createTypeSelector() {
        const wrapper = document.createElement("label");
        wrapper.className = "ui-select-wrapper";
        const select = document.createElement("select");
        select.className = "ui-select";
        const addOption = (value, label) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        };
        this.typeOptions.forEach(type => addOption(type, this.typeLabels[type] ?? capitalize(type)));
        addOption("__custom__", "自定义...");
        select.value = this.currentType;
        select.addEventListener("change", () => this.handleTypeChange(select));
        wrapper.appendChild(select);
        this.typeSelect = select;
        return wrapper;
    }

    handleTypeChange(select) {
        const value = select.value;
        if (value === "__custom__") {
            const input = prompt("输入自定义类型（仅限英文字母）：", this.currentType);
            if (!input) {
                select.value = this.currentType;
                return;
            }
            const sanitized = input.trim();
            if (!/^[A-Za-z]+$/.test(sanitized)) {
                alert("类型只能包含英文字母。");
                select.value = this.currentType;
                return;
            }
            this.currentType = sanitized.toLowerCase();
            this.ensureCustomOption();
            select.value = this.currentType;
        } else {
            this.currentType = value;
        }
        this.state?.setMindType?.(this.currentType);
    }

    ensureCustomOption() {
        if (!this.typeSelect) {
            return;
        }
        let option = Array.from(this.typeSelect.options).find(opt => opt.value === this.currentType);
        if (!option) {
            option = document.createElement("option");
            option.value = this.currentType;
            option.textContent = capitalize(this.currentType);
            this.typeSelect.insertBefore(option, this.typeSelect.querySelector('option[value="__custom__"]'));
        } else {
            option.textContent = capitalize(this.currentType);
        }
    }

    createButton(label, action, options = {}) {
        const button = document.createElement("button");
        button.className = "ui-button";
        if (options.variant) {
            button.dataset.variant = options.variant;
        }
        if (options.className) {
            button.classList.add(options.className);
        }
        button.textContent = label;
        button.addEventListener("click", action);
        return button;
    }

    destroy() {
        this.teardownFns.forEach(fn => fn?.());
    }
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
