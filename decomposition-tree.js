(function () {
  const DEFAULT_SETTINGS = {
    nodeWidth: 250,
    nodeHeight: 58,
    levelGap: 90,
    siblingGap: 16,
    barColor: "#2563eb",
    negativeBarColor: "#dc2626",
    showValues: true,
    initialExpandLevel: 1,
    maxVisibleNodes: 500,
    rootLabel: "Total"
  };

  const SAMPLE_ROWS = [
    { path: ["EMEA", "Germany"], value: 240 },
    { path: ["EMEA", "Poland"], value: 130 },
    { path: ["EMEA", "France"], value: 240 },
    { path: ["North America", "United States"], value: 360 },
    { path: ["North America", "Canada"], value: 70 },
    { path: ["APJ"], value: 200 }
  ];

  function toNumber(value) {
    if (value === undefined || value === null || value === "") {
      return 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const normalized = String(value)
      .replace(/,/g, "")
      .replace(/\s/g, "");

    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function readCellLabel(cell) {
    if (cell === undefined || cell === null) {
      return "";
    }

    if (typeof cell !== "object") {
      return String(cell);
    }

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
    if (cell === undefined || cell === null) {
      return "";
    }

    if (typeof cell !== "object") {
      return String(cell);
    }

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
    if (cell === undefined || cell === null) {
      return 0;
    }

    if (typeof cell !== "object") {
      return toNumber(cell);
    }

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

  function createNode(id, label, level) {
    return {
      id,
      label,
      level,
      value: 0,
      children: [],
      _childrenById: new Map()
    };
  }

  function finalizeNode(node) {
    node.children = Array.from(node._childrenById.values())
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .map(finalizeNode);

    delete node._childrenById;
    return node;
  }

  function buildTreeFromPathRows(pathRows, rootLabel) {
    const root = createNode("__root__", rootLabel || "Total", 0);

    pathRows.forEach(row => {
      const value = toNumber(row.value);
      const path = Array.isArray(row.path)
        ? row.path.filter(part => part !== undefined && part !== null && String(part) !== "")
        : [];

      if (!path.length) {
        return;
      }

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

    return [finalizeNode(root)];
  }

  function buildTreeFromParentRows(rows, rootLabel) {
    const byId = new Map();
    const root = createNode("__root__", rootLabel || "Total", 0);

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
        _childrenById: new Map()
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
    return [finalizeNode(root)];
  }

  function buildSampleTree(rootLabel) {
    return buildTreeFromPathRows(SAMPLE_ROWS, rootLabel);
  }

  function extractPathRowsFromSacBinding(binding) {
    if (!binding || !Array.isArray(binding.data) || !binding.metadata) {
      return [];
    }

    const metadata = binding.metadata;
    const feeds = metadata.feeds || {};

    const dimensionAliases =
      feeds.dimensions &&
      Array.isArray(feeds.dimensions.values)
        ? feeds.dimensions.values
        : [];

    const measureAliases =
      feeds.measures &&
      Array.isArray(feeds.measures.values)
        ? feeds.measures.values
        : [];

    const firstMeasureAlias = measureAliases[0];

    if (!dimensionAliases.length || !firstMeasureAlias) {
      return [];
    }

    return binding.data
      .map(row => {
        const path = dimensionAliases
          .map(alias => readCellLabel(row[alias]))
          .filter(label => label !== "");

        const ids = dimensionAliases
          .map(alias => readCellId(row[alias]))
          .filter(id => id !== "");

        const value = readMeasureValue(row[firstMeasureAlias]);

        return {
          path,
          ids,
          value,
          raw: row
        };
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

    tree.forEach(root => {
      visit(root, 0, null);
    });

    return visible;
  }

  class DecompositionTreeWidget extends HTMLElement {
    constructor() {
      super();

      this.attachShadow({ mode: "open" });

      this._settings = {
        ...DEFAULT_SETTINGS
      };

      this._tree = buildSampleTree(this._settings.rootLabel);
      this._expanded = new Set();

      this.setExpandedLevel(this._settings.initialExpandLevel, false);
    }

    connectedCallback() {
      this.tryRefreshFromBinding();
      this.render();
    }

    onCustomWidgetBeforeUpdate(changedProperties) {
      this._settings = {
        ...this._settings,
        ...changedProperties
      };
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

    tryRefreshFromBinding() {
      const binding = this.mainBinding;

      if (!binding) {
        return;
      }

      const pathRows = extractPathRowsFromSacBinding(binding);

      if (!pathRows.length) {
        return;
      }

      this._tree = buildTreeFromPathRows(
        pathRows,
        this._settings.rootLabel
      );

      this.setExpandedLevel(
        this._settings.initialExpandLevel,
        false
      );
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

          node.children.forEach(child => {
            visit(child, currentLevel + 1);
          });
        }
      };

      this._tree.forEach(root => {
        visit(root, 0);
      });

      if (doRender) {
        this.render();
      }
    }

    setData(rows) {
      if (Array.isArray(rows) && rows.length && Array.isArray(rows[0].path)) {
        this._tree = buildTreeFromPathRows(
          rows,
          this._settings.rootLabel
        );
      } else if (Array.isArray(rows)) {
        this._tree = buildTreeFromParentRows(
          rows,
          this._settings.rootLabel
        );
      } else {
        this._tree = buildSampleTree(this._settings.rootLabel);
      }

      this.setExpandedLevel(
        this._settings.initialExpandLevel,
        false
      );

      this.render();
    }

    toggleNode(nodeId) {
      if (this._expanded.has(nodeId)) {
        this._expanded.delete(nodeId);

        this.dispatchEvent(
          new CustomEvent("onNodeCollapse", {
            detail: { nodeId }
          })
        );
      } else {
        this._expanded.add(nodeId);

        this.dispatchEvent(
          new CustomEvent("onNodeExpand", {
            detail: { nodeId }
          })
        );
      }

      this.render();
    }

    render() {
      if (!this.shadowRoot) {
        return;
      }

      const s = this._settings;
      const visible = computeVisibleNodes(this._tree, this._expanded);

      if (visible.length > s.maxVisibleNodes) {
        this.shadowRoot.innerHTML =
          this.styles() +
          `<div class="state">
            Too many nodes to display (${visible.length}).
            Collapse levels or apply filters.
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

      const maxLevel = Math.max(
        0,
        ...positioned.map(n => n.level)
      );

      const width = Math.max(
        700,
        40 + (maxLevel + 1) * (s.nodeWidth + s.levelGap)
      );

      const height = Math.max(
        240,
        40 + positioned.length * (s.nodeHeight + s.siblingGap)
      );

      const maxValue = Math.max(
        1,
        ...positioned.map(n => Math.abs(n.value))
      );

      const byIndex = new Map(
        positioned.map(n => [n.visibleIndex, n])
      );

      const connectors = positioned
        .filter(n => n.parentVisibleIndex !== null && byIndex.has(n.parentVisibleIndex))
        .map(n => {
          const p = byIndex.get(n.parentVisibleIndex);

          const x1 = p.x + p.width;
          const y1 = p.y + p.height / 2;
          const x2 = n.x;
          const y2 = n.y + n.height / 2;
          const mid = (x1 + x2) / 2;

          return `
            <path
              class="connector"
              d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"
            />
          `;
        })
        .join("");

      const nodes = positioned
        .map(node => {
          const barX = node.x + 14;
          const barY = node.y + 31;
          const barWidthMax = node.width - 28;

          const barWidth = Math.max(
            0,
            Math.abs(node.value) / maxValue * barWidthMax
          );

          const hasChildren = node.children && node.children.length > 0;
          const expanded = this._expanded.has(node.id);
          const fill = node.value < 0 ? s.negativeBarColor : s.barColor;

          return `
            <g
              class="dt-node"
              data-node-id="${escapeXml(node.id)}"
              tabindex="0"
              role="button"
              aria-label="${escapeXml(node.label)}"
            >
              <title>
                ${escapeXml(node.label)} | Value: ${formatNumber(node.value)}
              </title>

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
                                   ></circle>
                      <text
                        x="${node.x + 14}"
                        y="${node.y + 19}"
                        text-anchor="middle"
                      >${expanded ? "−" : "+"}</text>
                    </g>
                  `
                  : ""
              }

              <text
                class="node-label"
                x="${node.x + (hasChildren ? 30 : 14)}"
                y="${node.y + 19}"
              >
                ${escapeXml(node.label)}
              </text>

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
                  ? `
                    <text
                      class="value-label"
                      x="${barX}"
                      y="${node.y + 50}"
                    >
                      ${formatNumber(node.value)}
                    </text>
                  `
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

      this.shadowRoot
        .querySelectorAll("[data-action='toggle']")
        .forEach(el => {
          el.addEventListener("click", event => {
            event.stopPropagation();

            this.toggleNode(
              el.getAttribute("data-node-id")
            );
          });
        });

      this.shadowRoot
        .querySelectorAll(".dt-node")
        .forEach(el => {
          el.addEventListener("click", () => {
            this.dispatchEvent(
              new CustomEvent("onNodeClick", {
                detail: {
                  nodeId: el.getAttribute("data-node-id")
                }
              })
            );
          });

          el.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();

              this.toggleNode(
                el.getAttribute("data-node-id")
              );
            }
          });
        });
    }

    styles() {
      return `
        <style>
          :host {
            display: block;
            width: 100%;
            height: 100%;
            min-height: 240px;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }

          .viewport {
            width: 100%;
            height: 100%;
            overflow: auto;
            background: #f8fafc;
            border-radius: 8px;
          }

          .state {
            padding: 16px;
            color: #475569;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
          }

          .node-card {
            fill: #ffffff;
            stroke: #e2e8f0;
            filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08));
          }

          .node-label {
            font-size: 12px;
            font-weight: 600;
            fill: #0f172a;
          }

          .value-label {
            font-size: 11px;
            fill: #475569;
          }

          .bar-bg {
            fill: #e2e8f0;
          }

          .connector {
            stroke: #cbd5e1;
            stroke-width: 1.3;
            fill: none;
          }

          .toggle {
            cursor: pointer;
          }

          .toggle circle {
            fill: #f8fafc;
            stroke: #94a3b8;
          }

          .toggle text {
            font-size: 13px;
            fill: #334155;
            pointer-events: none;
            user-select: none;
          }

          .dt-node {
            cursor: pointer;
            outline: none;
          }

          .dt-node:focus .node-card {
            stroke: #2563eb;
            stroke-width: 2;
          }
        </style>
      `;
    }
  }

  customElements.define(
    "com-company-decomposition-tree",
    DecompositionTreeWidget
  );
})();
