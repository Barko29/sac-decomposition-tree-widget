import { normalizeBindingToTree } from "./data-adapter.js";
import { computeVisibleNodes, computeNodePositions } from "./tree-layout.js";
import { renderSvg } from "./renderer-svg.js";

const DEFAULT_SETTINGS = {
  nodeWidth: 250,
  nodeHeight: 58,
  levelGap: 90,
  siblingGap: 16,
  thresholdAmber: 0.9,
  thresholdGreen: 1.0,
  neutralColor: "#64748b",
  greenColor: "#16a34a",
  amberColor: "#f59e0b",
  redColor: "#dc2626",
  showValues: true,
  initialExpandLevel: 1,
  maxVisibleNodes: 500
};

export class DecompositionTreeWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._settings = { ...DEFAULT_SETTINGS };
    this._tree = [];
    this._expanded = new Set();
    this._feedMap = {};
  }

  connectedCallback() {
    if (!this._tree.length) {
      this._tree = normalizeBindingToTree(window.__DECOMPOSITION_TREE_SAMPLE_DATA__ || []);
      this.setExpandedLevel(this._settings.initialExpandLevel);
    }
    this.render();
  }

  onCustomWidgetBeforeUpdate(changedProperties) {
    this._settings = { ...this._settings, ...changedProperties };
    if (changedProperties.feedMap) this._feedMap = changedProperties.feedMap;
  }

  onCustomWidgetAfterUpdate(changedProperties) {
    const binding = changedProperties.dataBindings || changedProperties.dataBinding || changedProperties.mainBinding;
    if (binding) {
      this._tree = normalizeBindingToTree(binding, this._feedMap);
      this.setExpandedLevel(this._settings.initialExpandLevel);
    }
    this.render();
  }

  onCustomWidgetResize() {
    this.render();
  }

  onCustomWidgetDestroy() {
    this.shadowRoot.innerHTML = "";
  }

  expandAll() {
    const visit = node => {
      this._expanded.add(node.id);
      node.children.forEach(visit);
    };
    this._tree.forEach(visit);
    this.render();
  }

  collapseAll() {
    this._expanded.clear();
    this.render();
  }

  setExpandedLevel(level = 1) {
    this._expanded.clear();
    const visit = (node, currentLevel) => {
      if (currentLevel < level) {
        this._expanded.add(node.id);
        node.children.forEach(child => visit(child, currentLevel + 1));
      }
    };
    this._tree.forEach(root => visit(root, 0));
    this.render();
  }

  setData(rows) {
    this._tree = normalizeBindingToTree(rows, this._feedMap);
    this.setExpandedLevel(this._settings.initialExpandLevel);
    this.render();
  }

  toggleNode(nodeId) {
    if (this._expanded.has(nodeId)) {
      this._expanded.delete(nodeId);
      this.dispatchEvent(new CustomEvent("onNodeCollapse", { detail: { nodeId } }));
    } else {
      this._expanded.add(nodeId);
      this.dispatchEvent(new CustomEvent("onNodeExpand", { detail: { nodeId } }));
    }
    this.render();
  }

  render() {
    if (!this.shadowRoot) return;

    const visible = computeVisibleNodes(this._tree, this._expanded);
    if (visible.length > this._settings.maxVisibleNodes) {
      this.shadowRoot.innerHTML = this.styles() + `<div class="state">Too many nodes to display (${visible.length}). Collapse levels or apply filters.</div>`;
      return;
    }

    const positioned = computeNodePositions(visible, this._settings);
    const svg = renderSvg(positioned, { ...this._settings, expandedSet: this._expanded });

    this.shadowRoot.innerHTML = this.styles() + `<div class="viewport">${svg}</div>`;
    this.shadowRoot.querySelectorAll("[data-action='toggle']").forEach(el => {
      el.addEventListener("click", event => {
        event.stopPropagation();
        this.toggleNode(el.getAttribute("data-node-id"));
      });
    });
    this.shadowRoot.querySelectorAll(".dt-node").forEach(el => {
      el.addEventListener("click", () => {
        const nodeId = el.getAttribute("data-node-id");
        this.dispatchEvent(new CustomEvent("onNodeClick", { detail: { nodeId } }));
      });
      el.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const nodeId = el.getAttribute("data-node-id");
          this.toggleNode(nodeId);
        }
      });
    });
  }

  styles() {
    return `<style>
      :host { display: block; width: 100%; height: 100%; min-height: 240px; color: #0f172a; font-family: Arial, sans-serif; }
      .viewport { width: 100%; height: 100%; overflow: auto; background: #f8fafc; border-radius: 8px; }
      .state { padding: 16px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
      .node-card { fill: #ffffff; stroke: #e2e8f0; filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08)); }
      .node-label { font-size: 12px; font-weight: 600; fill: #0f172a; }
      .value-label { font-size: 11px; fill: #475569; }
      .bar-bg { fill: #e2e8f0; }
      .target-line { stroke: #0f172a; stroke-width: 1.5; stroke-dasharray: 4 3; }
      .connector { stroke: #cbd5e1; stroke-width: 1.3; fill: none; }
      .toggle { cursor: pointer; }
      .toggle circle { fill: #f8fafc; stroke: #94a3b8; }
      .toggle text { font-size: 13px; fill: #334155; pointer-events: none; user-select: none; }
      .dt-node { cursor: pointer; outline: none; }
      .dt-node:focus .node-card { stroke: #2563eb; stroke-width: 2; }
    </style>`;
  }
}

customElements.define("com-company-decomposition-tree", DecompositionTreeWidget);
