import { graphState } from "./state.js";

export class IOHandler {
    constructor(state = graphState) {
        this.state = state;
        this.fileInput = null;
    }

    save(typeLabel = "daily") {
        const data = this.state.getState();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const storedStamp = sanitizeStampString(data.metadata?.created_stamp ?? data.metadata?.createdStamp);
        const createdIso = data.metadata?.created_at ?? data.metadata?.createdAt;
        const stampDate = parseIsoDate(createdIso) ?? new Date();
        const stamp = storedStamp ?? formatTimestamp(stampDate);
        const safeType = sanitizeType(typeLabel);
        link.download = `genesis-mind.${safeType}.${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    load() {
        if (!this.fileInput) {
            this.fileInput = document.createElement("input");
            this.fileInput.type = "file";
            this.fileInput.accept = "application/json";
            this.fileInput.style.display = "none";
            document.body.appendChild(this.fileInput);
            this.fileInput.addEventListener("change", () => {
                const file = this.fileInput.files?.[0];
                if (!file) {
                    return;
                }
                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const text = event.target?.result;
                        if (typeof text !== "string") {
                            throw new Error("Unexpected file content");
                        }
                        const data = JSON.parse(text);
                        this.state.loadFromData(data);
                    } catch (error) {
                        console.error("Failed to load graph", error);
                        alert("Unable to parse the selected JSON file.");
                    } finally {
                        this.fileInput.value = "";
                    }
                };
                reader.readAsText(file);
            });
        }
        this.fileInput.click();
    }
}

function formatTimestamp(date) {
    const pad = (num, size = 2) => String(num).padStart(size, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeType(value) {
    if (typeof value !== "string" || !value.trim()) {
        return "daily";
    }
    const cleaned = value.trim().toLowerCase().replace(/[^a-z]/g, "");
    return cleaned || "daily";
}

function parseIsoDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeStampString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return /^\d{8}-\d{6}$/.test(trimmed) ? trimmed : null;
}
