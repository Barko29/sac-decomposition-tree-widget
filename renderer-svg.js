import { getThresholdColor, getVariance } from "./thresholds.js";

export function renderSvg(positionedNodes, settings, handlers = {}) {
  const nodeWidth = settings.nodeWidth ?? 240;
  const nodeHeight = settings.nodeHeight ?? 54;
  const siblingGap = settings.siblingGap ?? 18;

  const maxLevel = Math.max(0, ...positionedNodes.map(n => n.level));
  const width = Math.max(700, 40 + (maxLevel + 1) * (nodeWidth + (settings.levelGap ?? 84)));
  const height = Math.max(240, 40 + positionedNodes.length * (nodeHeight + siblingGap));
  const maxValue = Math.max(1, ...positionedNodes.map(n => Math.max(Math.abs(n.actual), Math.abs(n.plan))));

  const nodesByIndex = new Map(positionedNodes.map(n => [n.visibleIndex, n]));
  const connectors = positionedNodes
    .filter(n => n.parentVisibleIndex !== null && nodesByIndex.has(n.parentVisibleIndex))
    .map(n => {
      const p = nodesByIndex.get(n.parentVisibleIndex);
      const x1 = p.x + p.width;
      const y1 = p.y + p.height / 2;
      const x2 = n.x;
      const y2 = n.y + n.height / 2;
      const mid = (x1 + x2) / 2;
      return `<path class="connector" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" />`;
    })
    .join("");

  const nodes = positionedNodes.map(node => renderNode(node, maxValue, settings)).join("");

  // Event delegation is attached by the Web Component after injecting this SVG.
  return `<svg class="dt-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Decomposition tree">
    ${connectors}
    ${nodes}
  </svg>`;
}

function renderNode(node, maxValue, settings) {
  const barX = node.x + 14;
  const barY = node.y + 31;
  const barWidthMax = node.width - 28;
  const actualWidth = Math.max(0, Math.abs(node.actual) / maxValue * barWidthMax);
  const targetX = barX + Math.abs(node.plan) / maxValue * barWidthMax;
  const color = getThresholdColor(node.actual, node.plan, settings);
  const hasChildren = node.children && node.children.length > 0;
  const expanded = settings.expandedSet?.has(node.id);
  const { variance, variancePct } = getVariance(node.actual, node.plan);

  return `<g class="dt-node" data-node-id="${escapeAttr(node.id)}" tabindex="0" role="button" aria-label="${escapeAttr(node.label)}">
    <title>${escapeXml(node.label)} | Actual: ${formatNumber(node.actual)} | Plan: ${formatNumber(node.plan)} | Var: ${formatNumber(variance)}${variancePct === null ? "" : ` (${formatPercent(variancePct)})`}</title>
    <rect class="node-card" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="10"></rect>
    ${hasChildren ? `<g class="toggle" data-action="toggle" data-node-id="${escapeAttr(node.id)}">
      <circle cx="${node.x + 14}" cy="${node.y + 15}" r="8"></circle>
      <text x="${node.x + 14}" y="${node.y + 19}" text-anchor="middle">${expanded ? "−" : "+"}</text>
    </g>` : ""}
    <text class="node-label" x="${node.x + (hasChildren ? 30 : 14)}" y="${node.y + 19}">${escapeXml(node.label)}</text>
    <rect class="bar-bg" x="${barX}" y="${barY}" width="${barWidthMax}" height="9" rx="4.5"></rect>
    <rect class="bar-actual" x="${barX}" y="${barY}" width="${actualWidth}" height="9" rx="4.5" fill="${color}"></rect>
    <line class="target-line" x1="${targetX}" y1="${barY - 5}" x2="${targetX}" y2="${barY + 15}"></line>
    ${settings.showValues !== false ? `<text class="value-label" x="${barX}" y="${node.y + 50}">${formatNumber(node.actual)} / ${formatNumber(node.plan)}</text>` : ""}
  </g>`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeAttr(value) {
  return escapeXml(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value || 0);
}
