/**
 * Normalizes SAC custom-widget data binding results into tree rows.
 *
 * This starter supports two inputs:
 * 1. Simple mock rows: [{ id, parentId, label, actual, plan }]
 * 2. Best-effort SAC-like rows using dimensions/measures objects.
 *
 * In production, adapt `extractRowsFromSacBinding` to your exact SAC/BW binding payload.
 */
export function normalizeBindingToTree(dataBinding, feedMap = {}) {
  const rows = Array.isArray(dataBinding)
    ? dataBinding
    : extractRowsFromSacBinding(dataBinding, feedMap);

  return buildTree(rows.map(normalizeRow));
}

export function extractRowsFromSacBinding(dataBinding, feedMap = {}) {
  if (!dataBinding) return [];

  // Common mock/test convention.
  if (Array.isArray(dataBinding.rows)) {
    return dataBinding.rows;
  }

  // Best-effort handling for SAC-like result sets.
  const resultSet = dataBinding.data || dataBinding.resultSet || dataBinding.values || [];
  if (!Array.isArray(resultSet)) return [];

  const idKey = feedMap.nodeId || "id";
  const parentIdKey = feedMap.parentId || "parentId";
  const labelKey = feedMap.label || feedMap.hierarchyDimension || "label";
  const actualKey = feedMap.actual || "actual";
  const planKey = feedMap.plan || "plan";

  return resultSet.map((row, index) => {
    const dimensions = row.dimensions || row.dimensionValues || row;
    const measures = row.measures || row.measureValues || row;

    return {
      id: readCell(dimensions[idKey]) ?? readCell(row[idKey]) ?? `node-${index}`,
      parentId: readCell(dimensions[parentIdKey]) ?? readCell(row[parentIdKey]) ?? null,
      label: readCell(dimensions[labelKey]) ?? readCell(row[labelKey]) ?? `Node ${index + 1}`,
      actual: toNumber(readCell(measures[actualKey]) ?? readCell(row[actualKey])),
      plan: toNumber(readCell(measures[planKey]) ?? readCell(row[planKey]))
    };
  });
}

function normalizeRow(row, index) {
  return {
    id: String(row.id ?? `node-${index}`),
    parentId: row.parentId === undefined || row.parentId === null || row.parentId === "" ? null : String(row.parentId),
    label: String(row.label ?? row.id ?? `Node ${index + 1}`),
    actual: toNumber(row.actual),
    plan: toNumber(row.plan),
    raw: row
  };
}

export function buildTree(rows) {
  const byId = new Map();
  const roots = [];

  rows.forEach(row => byId.set(row.id, { ...row, children: [] }));

  byId.forEach(node => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function readCell(cell) {
  if (cell === undefined || cell === null) return undefined;
  if (typeof cell !== "object") return cell;
  return cell.rawValue ?? cell.value ?? cell.label ?? cell.description ?? cell.id ?? cell.key;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
