import { graphState } from "./state.js";

export class IOHandler {
    constructor(state = graphState, renderer = null) {
        this.state = state;
        this.renderer = renderer;
        this.fileInput = null;
    }

    async exportImage() {
        if (!this.renderer) {
            console.warn("Renderer not available for export");
            return;
        }

        const bounds = this.renderer.getContentBounds();
        const scale = 2; // HD scale
        const width = bounds.width * scale;
        const height = bounds.height * scale;

        const clone = this.renderer.svg.cloneNode(true);
        
        // Remove transform from root group to reset view
        const rootGroup = clone.querySelector("g");
        if (rootGroup) {
             rootGroup.removeAttribute("transform");
        }

        clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
        clone.setAttribute("width", width);
        clone.setAttribute("height", height);
        clone.style.backgroundColor = "#ffffff";

        // Embed styles
        const styleElement = document.createElement("style");
        let cssText = "";
        for (const sheet of document.styleSheets) {
            try {
                if (sheet.href && sheet.href.includes("style.css")) {
                     for (const rule of sheet.cssRules) {
                        cssText += rule.cssText + "\n";
                     }
                }
            } catch (e) {
                console.warn("Access to stylesheet blocked", e);
            }
        }
        styleElement.textContent = cssText;
        clone.insertBefore(styleElement, clone.firstChild);

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clone);
        
        // Use Base64 Data URI to avoid tainted canvas issues with foreignObject
        const base64 = btoa(unescape(encodeURIComponent(svgString)));
        const url = `data:image/svg+xml;base64,${base64}`;

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            try {
                const pngUrl = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = pngUrl;
                link.download = `genesis-mind-export-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (e) {
                console.error("Export PNG failed, falling back to SVG", e);
                alert("由于浏览器安全限制，无法导出 PNG。将为您下载 SVG 文件。");
                
                const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = `genesis-mind-export-${Date.now()}.svg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            }
        };
        img.onerror = (e) => {
             console.error("Failed to load SVG image for export", e);
             alert("导出图片失败。");
        };
        img.src = url;
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
