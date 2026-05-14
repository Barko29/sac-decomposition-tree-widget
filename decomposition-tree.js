(function () {
  /* ---------- Defaults ---------- */

  const DEFAULT_SETTINGS = {
    nodeWidth: 250,
    nodeHeight: 58,
    levelGap: 90,
    siblingGap: 16,
    barColor: "#2563eb",
    negativeBarColor: "#dc2626",
    othersBarColor: "#64748b",
    showValues: true,
    initialExpandLevel: 1,
    maxVisibleNodes: 500,
    rootLabel: "Total",
    topN: 10,
    enableOthers: true,
    othersLabel: "Others",
    sortDescending: true,

    // Cosmetic colors
    backgroundColor: "#f8fafc",
    nodeBackgroundColor: "#ffffff",
    nodeBorderColor: "#e2e8f0",
    nodeShadowColor: "#0f172a",
    focusBorderColor: "#2563eb",
    labelColor: "#0f172a",
    valueLabelColor: "#475569",
    othersLabelColor: "#475569",
    barBackgroundColor: "#e2e8f0",
    connectorColor: "#cbd5e1",
    toggleBackgroundColor: "#f8fafc",
    toggleBorderColor: "#94a3b8",
    toggleTextColor: "#334155"
  };

  /* ---------- Generic helpers ---------- */

  function toNumber(value) {
    if (value === undefined || value === null || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const normalized = String(value).replace(/,/g, "").replace(/\s/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function readCellLabel(cell) {
    if (cell === undefined || cell === null) return "";
    if (typeof cell !== "object") return String(cell);
    return String(
      cell.label ??
      cell.description ??
      cell.formatted ??
      cell.value ??
      cell.id ??
      ""
    );
  }

  function readCellId(cell) {
    if (cell === undefined || cell === null) return "";
    if (typeof cell !== "object") return String(cell);
    return String(
      cell.id ??
      cell.key ??
      cell.raw ??
      cell.rawValue ??
      cell.label ??
      cell.description ??
      ""
    );
  }

  function readMeasureValue(cell) {
    if (cell === undefined || cell === null) return 0;
    if (typeof cell !== "object") return toNumber(cell);
    return toNumber(
      cell.raw ??
      cell.rawValue ??
      cell.value ??
      cell.formatted ??
      0
    );
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1
    }).format(value || 0);
  }

  function hexToRgba(hex, alpha) {
    if (typeof hex !== "string") return `rgba(0, 0, 0, ${alpha})`;
    const s = hex.trim().replace(/^#/, "");
    let r, g, b;
    if (s.length === 3) {
      r = parseInt(s[0] + s[0], 16);
      g = parseInt(s[1] + s[1], 16);
      b = parseInt(s[2] + s[2], 16);
    } else if (s.length === 6) {
      r = parseInt(s.slice(0, 2), 16);
      g = parseInt(s.slice(2, 4), 16);
      b = parseInt(s.slice(4, 6), 16);
    } else {
      return hex;
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return `rgba(0, 0, 0, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* ---------- Tree building ---------- */

  function createNode(id, label, level) {
    return {
      id,
      label,
      level,
      value: 0,
      children: [],
      _childrenById: new Map(),
      isOthers: false,
      hiddenChildrenCount: 0
    };
  }

  function sortChildren(children, sortDescending) {
    return children.sort((a, b) => {
      const diff = Math.abs(b.value) - Math.abs(a.value);
      return sortDescending ? diff : -diff;
    });
  }

  function createOthersNode(hiddenChildren, parentNode, settings) {
    const othersNode = createNode(
      `${parentNode.id}|__others__`,
      settings.othersLabel || "Others",
      parentNode.level + 1
    );
    othersNode.isOthers = true;
    othersNode.hiddenChildrenCount = hiddenChildren.length;
    othersNode.value = hiddenChildren.reduce(
      (sum, child) => sum + toNumber(child.value),
      0
    );
    othersNode.children = [];
    return othersNode;
  }

  function finalizeNode(node, settings) {
    let children = Array.from(node._childrenById.values())
      .map(child => finalizeNode(child, settings));

    children = sortChildren(children, settings.sortDescending);

    const topN = Math.max(0, toNumber(settings.topN));

    if (settings.enableOthers && topN > 0 && children.length > topN) {
      const visibleChildren = children.slice(0, topN);
      const hiddenChildren = children.slice(topN);
      const othersNode = createOthersNode(hiddenChildren, node, settings);
      children = [...visibleChildren, othersNode];
    }

    node.children = children;
    delete node._childrenById;
    return node;
  }

  function buildTreeFromPathRows(pathRows, settings) {
    const root = createNode("__root__", settings.rootLabel || "Total", 0);

    pathRows.forEach(row => {
      const value = toNumber(row.value);
      const path = Array.isArray(row.path)
        ? row.path.filter(
            part => part !== undefined && part !== null && String(part) !== ""
          )
        : [];

      if (!path.length) return;

      root.value += value;

      let current = root;
      let cumulativeId = "__root__";

      path.forEach((part, index) => {
        const label = String(part);
        const safePart = label || `Level ${index + 1}`;
        cumulativeId += `|${safePart}`;

        if (!current._childrenById.has(cumulativeId)) {
          current._childrenById.set(
            cumulativeId,
            createNode(cumulativeId, safePart, index + 1)
          );
        }

        current = current._childrenById.get(cumulativeId);
        current.value += value;
      });
    });

    return [finalizeNode(root, settings)];
  }

  function buildTreeFromParentRows(rows, settings) {
    const byId = new Map();
    const root = createNode("__root__", settings.rootLabel || "Total", 0);

    rows.forEach((row, index) => {
      const id = String(row.id ?? `node-${index}`);
      const parentId =
        row.parentId === undefined ||
        row.parentId === null ||
        row.parentId === ""
          ? "__root__"
          : String(row.parentId);

      byId.set(id, {
        id,
        parentId,
        label: String(row.label ?? id),
        value: toNumber(row.value ?? row.actual ?? row.measure),
        children: [],
        _childrenById: new Map(),
        isOthers: false,
        hiddenChildrenCount: 0
      });
    });

    byId.forEach(node => {
      if (node.parentId !== "__root__" && byId.has(node.parentId)) {
        const parent = byId.get(node.parentId);
        parent._childrenById.set(node.id, node);
      } else {
        root._childrenById.set(node.id, node);
      }
    });

    function rollup(node) {
      let total = toNumber(node.value);
      node._childrenById.forEach(child => {
        total += rollup(child);
      });
      node.value = total;
      return total;
    }

    rollup(root);
    return [finalizeNode(root, settings)];
  }

  function extractPathRowsFromSacBinding(binding) {
    if (!binding || !Array.isArray(binding.data) || !binding.metadata) {
      return [];
    }

    const feeds = binding.metadata.feeds || {};
    const dimensionAliases =
      feeds.dimensions && Array.isArray(feeds.dimensions.values)
        ? feeds.dimensions.values
        : [];
    const measureAliases =
      feeds.measures && Array.isArray(feeds.measures.values)
        ? feeds.measures.values
        : [];
    const firstMeasureAlias = measureAliases[0];

    if (!dimensionAliases.length || !firstMeasureAlias) return [];

    return binding.data
      .map(row => {
        const path = dimensionAliases
          .map(alias => readCellLabel(row[alias]))
          .filter(label => label !== "");
        const ids = dimensionAliases
          .map(alias => readCellId(row[alias]))
          .filter(id => id !== "");
        const value = readMeasureValue(row[firstMeasureAlias]);
        return { path, ids, value, raw: row };
      })
      .filter(row => row.path.length > 0);
  }

  function computeVisibleNodes(tree, expandedSet) {
    const visible = [];

    function visit(node, level, parentVisibleIndex = null) {
      const visibleIndex = visible.length;
      visible.push({
        ...node,
        level,
        visibleIndex,
        parentVisibleIndex
      });
      if (expandedSet.has(node.id)) {
        node.children.forEach(child => {
          visit(child, level + 1, visibleIndex);
        });
      }
    }

    tree.forEach(root => visit(root, 0, null));
    return visible;
  }

  /* ---------- Main custom element ---------- */

  class DecompositionTreeWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });

      this._settings = { ...DEFAULT_SETTINGS };
      this._lastPathRows = [];
      this._tree = [];
      this._expanded = new Set();

      this.setExpandedLevel(this._settings.initialExpandLevel, false);
    }

    connectedCallback() {
      this.tryRefreshFromBinding();
      this.render();
    }

    onCustomWidgetBeforeUpdate(changedProperties) {
      this._settings = { ...this._settings, ...changedProperties };
      this.rebuildTreeFromLastData();
    }

    onCustomWidgetAfterUpdate() {
      this.tryRefreshFromBinding();
      this.render();
    }

    onCustomWidgetResize() {
      this.render();
    }

    onCustomWidgetDestroy() {
      this.shadowRoot.innerHTML = "";
    }

    rebuildTreeFromLastData() {
      if (this._lastPathRows && this._lastPathRows.length) {
        this._tree = buildTreeFromPathRows(this._lastPathRows, this._settings);
      } else {
        this._tree = [];
      }
      this.setExpandedLevel(this._settings.initialExpandLevel, false);
    }

    tryRefreshFromBinding() {
      const binding = this.mainBinding;
      if (!binding) return;

      const pathRows = extractPathRowsFromSacBinding(binding);
      if (!pathRows.length) return;

      this._lastPathRows = pathRows;
      this._tree = buildTreeFromPathRows(pathRows, this._settings);
      this.setExpandedLevel(this._settings.initialExpandLevel, false);
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
      if (Array.isArray(rows) && rows.length && Array.isArray(rows[0].path)) {
        this._lastPathRows = rows;
        this._tree = buildTreeFromPathRows(rows, this._settings);
      } else if (Array.isArray(rows)) {
        this._lastPathRows = [];
        this._tree = buildTreeFromParentRows(rows, this._settings);
      } else {
        this._lastPathRows = [];
        this._tree = [];
      }
      this.setExpandedLevel(this._settings.initialExpandLevel, false);
      this.render();
    }

    toggleNode(nodeId) {
      if (this._expanded.has(nodeId)) {
        this._expanded.delete(nodeId);
        this.dispatchEvent(
          new CustomEvent("onNodeCollapse", { detail: { nodeId } })
        );
      } else {
        this._expanded.add(nodeId);
        this.dispatchEvent(
          new CustomEvent("onNodeExpand", { detail: { nodeId } })
        );
      }
      this.render();
    }

    getNodeColor(node) {
      if (node.isOthers) return this._settings.othersBarColor;
      if (node.value < 0) return this._settings.negativeBarColor;
      return this._settings.barColor;
    }

    getNodeTitle(node) {
      if (node.isOthers && node.hiddenChildrenCount) {
        return `${node.label} (${node.hiddenChildrenCount} hidden members) | Value: ${formatNumber(node.value)}`;
      }
      return `${node.label} | Value: ${formatNumber(node.value)}`;
    }

    getNodeDisplayLabel(node) {
      if (node.isOthers && node.hiddenChildrenCount) {
        return `${node.label} (${node.hiddenChildrenCount})`;
      }
      return node.label;
    }

    render() {
      if (!this.shadowRoot) return;

      const s = this._settings;
      const visible = computeVisibleNodes(this._tree, this._expanded);

      // No data yet — render nothing. Avoids the dummy-data flash on
      // initial load before SAC pushes the real binding via
      // onCustomWidgetAfterUpdate.
      if (!visible.length) {
        this.shadowRoot.innerHTML = "";
        return;
      }

      if (visible.length > s.maxVisibleNodes) {
        this.shadowRoot.innerHTML =
          this.styles() +
          `<div class="state">
            Too many nodes to display (${visible.length}).
            Collapse levels, reduce Top-N, or apply filters.
          </div>`;
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
      const width = Math.max(
        700,
        40 + (maxLevel + 1) * (s.nodeWidth + s.levelGap)
      );
      const height = Math.max(
        240,
        40 + positioned.length * (s.nodeHeight + s.siblingGap)
      );
      const maxValue = Math.max(1, ...positioned.map(n => Math.abs(n.value)));

      const byIndex = new Map(positioned.map(n => [n.visibleIndex, n]));

      const connectors = positioned
        .filter(
          n =>
            n.parentVisibleIndex !== null &&
            byIndex.has(n.parentVisibleIndex)
        )
        .map(n => {
          const p = byIndex.get(n.parentVisibleIndex);
          const x1 = p.x + p.width;
          const y1 = p.y + p.height / 2;
          const x2 = n.x;
          const y2 = n.y + n.height / 2;
          const mid = (x1 + x2) / 2;
          return `<path class="connector" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" />`;
        })
        .join("");

      const nodes = positioned
        .map(node => {
          const barX = node.x + 14;
          const barY = node.y + 31;
          const barWidthMax = node.width - 28;
          const barWidth = Math.max(
            0,
            (Math.abs(node.value) / maxValue) * barWidthMax
          );
          const hasChildren = node.children && node.children.length > 0;
          const expanded = this._expanded.has(node.id);
          const fill = this.getNodeColor(node);
          const displayLabel = this.getNodeDisplayLabel(node);
          const nodeTitle = this.getNodeTitle(node);

          return `
            <g
              class="dt-node ${node.isOthers ? "others-node" : ""}"
              data-node-id="${escapeXml(node.id)}"
              data-has-children="${hasChildren ? "true" : "false"}"
              tabindex="0"
              role="button"
              aria-label="${escapeXml(displayLabel)}"
            >
              <title>${escapeXml(nodeTitle)}</title>

              <rect
                class="node-card"
                x="${node.x}"
                y="${node.y}"
                width="${node.width}"
                height="${node.height}"
                rx="10"
              ></rect>

              ${
                hasChildren
                  ? `
                    <g
                      class="toggle"
                      data-action="toggle"
                      data-node-id="${escapeXml(node.id)}"
                    >
                      <circle
                        cx="${node.x + 14}"
                        cy="${node.y + 19}"
                        r="9"
                      ></circle>
                      <text
                        x="${node.x + 14}"
                        y="${node.y + 23}"
                        text-anchor="middle"
                      >${expanded ? "−" : "+"}</text>
                    </g>
                  `
                  : ""
              }

              <text
                class="node-label"
                x="${node.x + (hasChildren ? 30 : 14)}"
                y="${node.y + 23}"
              >${escapeXml(displayLabel)}</text>

              <rect
                class="bar-bg"
                x="${barX}"
                y="${barY}"
                width="${barWidthMax}"
                height="9"
                rx="4.5"
              ></rect>

              <rect
                class="bar-value"
                x="${barX}"
                y="${barY}"
                width="${barWidth}"
                height="9"
                rx="4.5"
                fill="${fill}"
              ></rect>

              ${
                s.showValues !== false
                  ? `<text class="value-label" x="${barX}" y="${node.y + 52}">${formatNumber(node.value)}</text>`
                  : ""
              }
            </g>
          `;
        })
        .join("");

      this.shadowRoot.innerHTML =
        this.styles() +
        `
          <div class="viewport">
            <svg
              width="${width}"
              height="${height}"
              viewBox="0 0 ${width} ${height}"
              role="img"
              aria-label="Decomposition tree"
            >
              ${connectors}
              ${nodes}
            </svg>
          </div>
        `;

      const viewport = this.shadowRoot.querySelector(".viewport");
      if (viewport) {
        viewport.addEventListener("click", event => {
          const toggleEl = event.target.closest("[data-action='toggle']");
          const nodeEl = event.target.closest(".dt-node");

          if (toggleEl) {
            event.preventDefault();
            event.stopPropagation();
            const nodeId = toggleEl.getAttribute("data-node-id");
            if (nodeId) this.toggleNode(nodeId);
            return;
          }

          if (nodeEl) {
            event.preventDefault();
            event.stopPropagation();
            const nodeId = nodeEl.getAttribute("data-node-id");
            this.dispatchEvent(
              new CustomEvent("onNodeClick", { detail: { nodeId } })
            );
          }
        });
      }

      this.shadowRoot.querySelectorAll(".dt-node").forEach(el => {
        el.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            const nodeId = el.getAttribute("data-node-id");
            const hasChildren =
              el.getAttribute("data-has-children") === "true";
            if (hasChildren && nodeId) this.toggleNode(nodeId);
          }
        });
      });
    }

    styles() {
      const s = this._settings;
      const shadowRgba = hexToRgba(s.nodeShadowColor, 0.18);
      return `
        <style>
          :host {
            display: block;
            width: 100%;
            height: 100%;
            min-height: 240px;
            color: ${s.labelColor};
            font-family: Arial, sans-serif;
          }
          .viewport {
            width: 100%;
            height: 100%;
            overflow: auto;
            background: ${s.backgroundColor};
            border-radius: 8px;
          }
          .state {
            padding: 16px;
            color: ${s.valueLabelColor};
            background: ${s.backgroundColor};
            border: 1px solid ${s.nodeBorderColor};
            border-radius: 8px;
          }
          .node-card {
            fill: ${s.nodeBackgroundColor};
            stroke: ${s.nodeBorderColor};
            filter: drop-shadow(0 1px 2px ${shadowRgba});
          }
          .others-node .node-card { stroke-dasharray: 4 3; }
          .node-label {
            font-size: 12px;
            font-weight: 600;
            fill: ${s.labelColor};
            pointer-events: none;
          }
          .others-node .node-label { fill: ${s.othersLabelColor}; }
          .value-label {
            font-size: 11px;
            fill: ${s.valueLabelColor};
            pointer-events: none;
          }
          .bar-bg { fill: ${s.barBackgroundColor}; pointer-events: none; }
          .bar-value { pointer-events: none; }
          .connector {
            stroke: ${s.connectorColor};
            stroke-width: 1.3;
            fill: none;
            pointer-events: none;
          }
          .toggle { cursor: pointer; pointer-events: all; }
          .toggle circle {
            fill: ${s.toggleBackgroundColor};
            stroke: ${s.toggleBorderColor};
            pointer-events: all;
          }
          .toggle text {
            font-size: 13px;
            fill: ${s.toggleTextColor};
            pointer-events: none;
            user-select: none;
          }
          .dt-node { cursor: default; outline: none; pointer-events: all; }
          .dt-node .toggle { cursor: pointer; }
          .dt-node:focus .node-card { stroke: ${s.focusBorderColor}; stroke-width: 2; }
        </style>
      `;
    }
  }

  /* ---------- Styling panel (Builder Panel) ----------
     Renders form controls bound to manifest properties. Each control,
     on change, fires a 'propertiesChanged' CustomEvent which SAC routes
     back into the main widget's onCustomWidgetBeforeUpdate hook. */

  const STYLING_FIELDS = [
    { section: "Layout" },
    { prop: "nodeWidth",             label: "Node width (px)",          type: "number",  min: 80,  max: 600 },
    { prop: "nodeHeight",            label: "Node height (px)",         type: "number",  min: 30,  max: 200 },
    { prop: "levelGap",              label: "Gap between levels (px)",  type: "number",  min: 0,   max: 400 },
    { prop: "siblingGap",            label: "Gap between siblings (px)",type: "number",  min: 0,   max: 200 },

    { section: "Bars" },
    { prop: "barColor",              label: "Bar color (positive)",     type: "color"  },
    { prop: "negativeBarColor",      label: "Bar color (negative)",     type: "color"  },
    { prop: "othersBarColor",        label: "Bar color (Others)",       type: "color"  },
    { prop: "barBackgroundColor",    label: "Bar track (empty) color",  type: "color"  },

    { section: "Background" },
    { prop: "backgroundColor",       label: "Widget background",        type: "color"  },

    { section: "Node card" },
    { prop: "nodeBackgroundColor",   label: "Card fill",                type: "color"  },
    { prop: "nodeBorderColor",       label: "Card border",              type: "color"  },
    { prop: "nodeShadowColor",       label: "Card shadow",              type: "color"  },
    { prop: "focusBorderColor",      label: "Card border when focused", type: "color"  },

    { section: "Labels" },
    { prop: "labelColor",            label: "Node label color",         type: "color"  },
    { prop: "valueLabelColor",       label: "Value label color",        type: "color"  },
    { prop: "othersLabelColor",      label: "Others label color",       type: "color"  },

    { section: "Connectors" },
    { prop: "connectorColor",        label: "Connector line color",     type: "color"  },

    { section: "Toggle button (+/−)" },
    { prop: "toggleBackgroundColor", label: "Toggle fill",              type: "color"  },
    { prop: "toggleBorderColor",     label: "Toggle border",            type: "color"  },
    { prop: "toggleTextColor",       label: "Toggle text",              type: "color"  },

    { section: "Display" },
    { prop: "showValues",            label: "Show value labels",        type: "boolean" },
    { prop: "rootLabel",             label: "Root label",               type: "text"    },
    { prop: "initialExpandLevel",    label: "Initial expand level",     type: "number", min: 0, max: 20 },
    { prop: "maxVisibleNodes",       label: "Max visible nodes",        type: "number", min: 10, max: 5000 },

    { section: "Top-N / Others" },
    { prop: "topN",                  label: "Top N per parent",         type: "number", min: 0, max: 100 },
    { prop: "enableOthers",          label: "Roll up rest into Others", type: "boolean" },
    { prop: "othersLabel",           label: "Others label",             type: "text"    },
    { prop: "sortDescending",        label: "Sort descending by value", type: "boolean" }
  ];

  class DecompositionTreeStyling extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._props = { ...DEFAULT_SETTINGS };
      this._rendered = false;
      this.render();
    }

    /* SAC pushes the current property values here whenever the panel is
       opened or properties change elsewhere. Merge them, then refresh
       only the affected controls (preserving focus/caret if the user
       is editing something else). */
    onCustomWidgetBeforeUpdate(changedProperties) {
      this._props = { ...this._props, ...changedProperties };
      this.syncControls();
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      this._props = { ...this._props, ...changedProperties };
      this.syncControls();
    }

    /* Push a single property change up to SAC. */
    emitChange(prop, value) {
      this._props[prop] = value;
      this.dispatchEvent(
        new CustomEvent("propertiesChanged", {
          detail: { properties: { [prop]: value } }
        })
      );
    }

    /* Update each control's displayed value from this._props without
       wiping the DOM (and without re-attaching listeners). */
    syncControls() {
      if (!this._rendered) return;

      STYLING_FIELDS.forEach(field => {
        if (!field.prop) return;

        const el = this.shadowRoot.querySelector(
          `[data-prop="${field.prop}"]`
        );
        if (!el) return;

        const current = this._props[field.prop];

        if (field.type === "boolean") {
          if (el.checked !== Boolean(current)) {
            el.checked = Boolean(current);
          }
        } else if (field.type === "number") {
          const next = String(current ?? "");
          if (document.activeElement !== el && el.value !== next) {
            el.value = next;
          }
        } else {
          const next = String(current ?? "");
          if (document.activeElement !== el && el.value !== next) {
            el.value = next;
          }
        }
      });
    }

    render() {
      const rowsHtml = STYLING_FIELDS
        .map(field => {
          if (field.section) {
            return `<div class="section-title">${escapeXml(field.section)}</div>`;
          }

          const current = this._props[field.prop];
          const safeProp = escapeXml(field.prop);
          const labelHtml = escapeXml(field.label);

          if (field.type === "boolean") {
            const checked = current ? "checked" : "";
            return `
              <label class="row row-toggle">
                <span class="label">${labelHtml}</span>
                <input
                  type="checkbox"
                  data-prop="${safeProp}"
                  ${checked}
                />
              </label>
            `;
          }

          if (field.type === "color") {
            const val = escapeXml(current ?? "#000000");
            return `
              <label class="row">
                <span class="label">${labelHtml}</span>
                <input
                  type="color"
                  data-prop="${safeProp}"
                  value="${val}"
                />
              </label>
            `;
          }

          if (field.type === "number") {
            const val = escapeXml(current ?? "");
            const min = field.min != null ? `min="${field.min}"` : "";
            const max = field.max != null ? `max="${field.max}"` : "";
            return `
              <label class="row">
                <span class="label">${labelHtml}</span>
                <input
                  type="number"
                  data-prop="${safeProp}"
                  value="${val}"
                  ${min} ${max}
                />
              </label>
            `;
          }

          // text
          const val = escapeXml(current ?? "");
          return `
            <label class="row">
              <span class="label">${labelHtml}</span>
              <input
                type="text"
                data-prop="${safeProp}"
                value="${val}"
              />
            </label>
          `;
        })
        .join("");

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            padding: 10px 12px 14px;
            font-family: "72", "72full", Arial, sans-serif;
            color: #1d2d3e;
            font-size: 12px;
            background: #ffffff;
          }
          .section-title {
            margin: 12px 0 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #556b82;
            border-bottom: 1px solid #e5e9ef;
            padding-bottom: 4px;
          }
          .section-title:first-child { margin-top: 0; }
          .row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 6px 0;
          }
          .row .label {
            flex: 1 1 auto;
            color: #1d2d3e;
          }
          .row input[type="number"],
          .row input[type="text"] {
            flex: 0 0 110px;
            padding: 4px 6px;
            border: 1px solid #bfc8d4;
            border-radius: 4px;
            font: inherit;
            color: inherit;
            background: #ffffff;
            box-sizing: border-box;
          }
          .row input[type="number"]:focus,
          .row input[type="text"]:focus {
            outline: none;
            border-color: #0a6ed1;
            box-shadow: 0 0 0 1px #0a6ed1;
          }
          .row input[type="color"] {
            flex: 0 0 40px;
            height: 24px;
            padding: 0;
            border: 1px solid #bfc8d4;
            border-radius: 4px;
            background: #ffffff;
            cursor: pointer;
          }
          .row-toggle {
            cursor: pointer;
          }
          .row input[type="checkbox"] {
            flex: 0 0 auto;
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: #0a6ed1;
          }
        </style>
        ${rowsHtml}
      `;

      this._rendered = true;
      this.wireEvents();
    }

    wireEvents() {
      this.shadowRoot
        .querySelectorAll("input[data-prop]")
        .forEach(input => {
          const prop = input.getAttribute("data-prop");
          const field = STYLING_FIELDS.find(f => f.prop === prop);
          if (!field) return;

          if (field.type === "boolean") {
            input.addEventListener("change", () => {
              this.emitChange(prop, Boolean(input.checked));
            });
          } else if (field.type === "number") {
            input.addEventListener("change", () => {
              const n = Number(input.value);
              this.emitChange(prop, Number.isFinite(n) ? n : 0);
            });
          } else if (field.type === "color") {
            input.addEventListener("change", () => {
              this.emitChange(prop, String(input.value || ""));
            });
          } else {
            input.addEventListener("change", () => {
              this.emitChange(prop, String(input.value ?? ""));
            });
          }
        });
    }
  }

  /* ---------- Register elements ---------- */

  if (!customElements.get("com-company-decomposition-tree")) {
    customElements.define(
      "com-company-decomposition-tree",
      DecompositionTreeWidget
    );
  }

  if (!customElements.get("com-company-decomposition-tree-styling")) {
    customElements.define(
      "com-company-decomposition-tree-styling",
      DecompositionTreeStyling
    );
  }
})();
