(function () {
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

  const SAMPLE_DATA = [
    { id: "total", parentId: null, label: "Total Revenue", actual: 1240, plan: 1200 },
    { id: "emea", parentId: "total", label: "EMEA", actual: 610, plan: 580 },
    { id: "na", parentId: "total", label: "North America", actual: 430, plan: 470 },
    { id: "apj", parentId: "total", label: "APJ", actual: 200, plan: 150 },
    { id: "de", parentId: "emea", label: "Germany", actual: 240, plan: 220 },
    { id: "pl", parentId: "emea", label: "Poland", actual: 130, plan: 160 },
    { id: "fr", parentId: "emea", label: "France", actual: 240, plan: 200 },
    { id: "us", parentId: "na", label: "United States", actual: 360, plan: 400 },
    { id: "ca", parentId: "na", label: "Canada", actual: 70, plan: 70 }
  ];

  function toNumber(value) {
    if (value === undefined || value === null || value === "") return 0;
    const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeRows(data) {
    const rows = Array.isArray(data) ? data : (data && Array.isArray(data.rows) ? data.rows : SAMPLE_DATA);
    return rows.map((row, index) => ({
      id: String(row.id ?? `node-${index}`),
      parentId: row.parentId === undefined || row.parentId === null || row.parentId === "" ? null : String(row.parentId),
      label: String(row.label ?? row.id ?? `Node ${index + 1}`),
      actual: toNumber(row.actual),
      plan: toNumber(row.plan),
      children: []
    }));
  }

  function buildTree(data) {
    const rows = normalizeRows(data);
    const byId = new Map();
    const roots = [];
    rows.forEach(row => byId.set(row.id, { ...row, children: [] }));
    byId.forEach(node => {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId).children.push(node);
      else roots.push(node);
    });
    return roots;
  }

  function computeVisibleNodes(tree, expandedSet) {
    const visible = [];
    function visit(node, level, parentVisibleIndex = null) {
      const visibleIndex = visible.length;
      visible.push({ ...node, level, visibleIndex, parentVisibleIndex });
      if (expandedSet.has(node.id)) node.children.forEach(child => visit(child, level + 1, visibleIndex));
    }
    tree.forEach(root => visit(root, 0, null));
    return visible;
  }

  function colorFor(actual, plan, settings) {
    if (!Number.isFinite(actual) || !Number.isFinite(plan) || plan === 0) return settings.neutralColor;
    const ratio = actual / plan;
    if (ratio >= settings.thresholdGreen) return settings.greenColor;
    if (ratio >= settings.thresholdAmber) return settings.amberColor;
    return settings.redColor;
  }

  function escapeXml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value || 0);
  }

  class DecompositionTreeWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._settings = { ...DEFAULT_SETTINGS };
      this._tree = buildTree(SAMPLE_DATA);
      this._expanded = new Set();
      this.setExpandedLevel(this._settings.initialExpandLevel, false);
    }

    connectedCallback() { this.render(); }

    onCustomWidgetBeforeUpdate(changedProperties) {
      this._settings = { ...this._settings, ...changedProperties };
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      const binding = changedProperties && (changedProperties.dataBindings || changedProperties.dataBinding || changedProperties.mainBinding);
      if (binding) {
        this._tree = buildTree(binding);
        this.setExpandedLevel(this._settings.initialExpandLevel, false);
      }
      this.render();
    }

    onCustomWidgetResize() { this.render(); }
    onCustomWidgetDestroy() { this.shadowRoot.innerHTML = ""; }

    expandAll() {
      const visit = node => { this._expanded.add(node.id); node.children.forEach(visit); };
      this._tree.forEach(visit);
      this.render();
    }

    collapseAll() { this._expanded.clear(); this.render(); }

    setExpandedLevel(level = 1, doRender = true) {
      this._expanded.clear();
      const visit = (node, currentLevel) => {
        if (currentLevel < level) {
          this._expanded.add(node.id);
          node.children.forEach(child => visit(child, currentLevel + 1));
        }
      };
      this._tree.forEach(root => visit(root, 0));
      if (doRender) this.render();
    }

    setData(rows) {
      this._tree = buildTree(rows);
      this.setExpandedLevel(this._settings.initialExpandLevel, false);
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
      const s = this._settings;
      const visible = computeVisibleNodes(this._tree, this._expanded);
      if (visible.length > s.maxVisibleNodes) {
        this.shadowRoot.innerHTML = this.styles() + `<div class="state">Too many nodes to display (${visible.length}). Collapse levels or apply filters.</div>`;
        return;
      }

      const positioned = visible.map((node, rowIndex) => ({
        ...node,
        x: 20 + node.level * (s.nodeWidth + s.levelGap),
        y: 20 + rowIndex * (s.nodeHeight + s.siblingGap),
        width: s.nodeWidth,
        height: s.nodeHeight
      }));
      const maxLevel = Math.max(0, ...positioned.map(n => n.level));
      const width = Math.max(700, 40 + (maxLevel + 1) * (s.nodeWidth + s.levelGap));
      const height = Math.max(240, 40 + positioned.length * (s.nodeHeight + s.siblingGap));
      const maxValue = Math.max(1, ...positioned.map(n => Math.max(Math.abs(n.actual), Math.abs(n.plan))));
      const byIndex = new Map(positioned.map(n => [n.visibleIndex, n]));

      const connectors = positioned.filter(n => n.parentVisibleIndex !== null && byIndex.has(n.parentVisibleIndex)).map(n => {
        const p = byIndex.get(n.parentVisibleIndex);
        const x1 = p.x + p.width, y1 = p.y + p.height / 2, x2 = n.x, y2 = n.y + n.height / 2, mid = (x1 + x2) / 2;
        return `<path class="connector" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" />`;
      }).join("");

      const nodes = positioned.map(node => {
        const barX = node.x + 14;
        const barY = node.y + 31;
        const barWidthMax = node.width - 28;
        const actualWidth = Math.max(0, Math.abs(node.actual) / maxValue * barWidthMax);
        const targetX = barX + Math.abs(node.plan) / maxValue * barWidthMax;
        const hasChildren = node.children && node.children.length > 0;
        const expanded = this._expanded.has(node.id);
        const fill = colorFor(node.actual, node.plan, s);
        return `<g class="dt-node" data-node-id="${escapeXml(node.id)}" tabindex="0" role="button" aria-label="${escapeXml(node.label)}">
          <title>${escapeXml(node.label)} | Actual: ${formatNumber(node.actual)} | Plan: ${formatNumber(node.plan)}</title>
          <rect class="node-card" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10"></rect>
          ${hasChildren ? `<g class="toggle" data-action="toggle" data-node-id="${escapeXml(node.id)}"><circle cx="${node.x + 14}" cy="${node.y + 15}" r="8"></circle><text x="${node.x + 14}" y="${node.y + 19}" text-anchor="middle">${expanded ? "−" : "+"}</text></g>` : ""}
          <text class="node-label" x="${node.x + (hasChildren ? 30 : 14)}" y="${node.y + 19}">${escapeXml(node.label)}</text>
          <rect class="bar-bg" x="${barX}" y="${barY}" width="${barWidthMax}" height="9" rx="4.5"></rect>
          <rect class="bar-actual" x="${barX}" y="${barY}" width="${actualWidth}" height="9" rx="4.5" fill="${fill}"></rect>
          <line class="target-line" x1="${targetX}" y1="${barY - 5}" x2="${targetX}" y2="${barY + 15}"></line>
          ${s.showValues !== false ? `<text class="value-label" x="${barX}" y="${node.y + 50}">${formatNumber(node.actual)} / ${formatNumber(node.plan)}</text>` : ""}
        </g>`;
      }).join("");

      this.shadowRoot.innerHTML = this.styles() + `<div class="viewport"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Decomposition tree">${connectors}${nodes}</svg></div>`;

      this.shadowRoot.querySelectorAll("[data-action='toggle']").forEach(el => {
        el.addEventListener("click", event => {
          event.stopPropagation();
          this.toggleNode(el.getAttribute("data-node-id"));
        });
      });
      this.shadowRoot.querySelectorAll(".dt-node").forEach(el => {
        el.addEventListener("click", () => this.dispatchEvent(new CustomEvent("onNodeClick", { detail: { nodeId: el.getAttribute("data-node-id") } })));
        el.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.toggleNode(el.getAttribute("data-node-id"));
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
})();
