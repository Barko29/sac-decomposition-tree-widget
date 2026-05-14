export function computeVisibleNodes(tree, expandedSet) {
  const visible = [];

  function visit(node, level, parentVisibleIndex = null) {
    const visibleIndex = visible.length;
    visible.push({ ...node, level, visibleIndex, parentVisibleIndex });

    if (expandedSet.has(node.id)) {
      node.children.forEach(child => visit(child, level + 1, visibleIndex));
    }
  }

  tree.forEach(root => visit(root, 0, null));
  return visible;
}

export function computeNodePositions(visibleNodes, settings) {
  const nodeWidth = settings.nodeWidth ?? 240;
  const nodeHeight = settings.nodeHeight ?? 54;
  const levelGap = settings.levelGap ?? 84;
  const siblingGap = settings.siblingGap ?? 18;
  const marginX = settings.marginX ?? 20;
  const marginY = settings.marginY ?? 20;

  return visibleNodes.map((node, rowIndex) => ({
    ...node,
    x: marginX + node.level * (nodeWidth + levelGap),
    y: marginY + rowIndex * (nodeHeight + siblingGap),
    width: nodeWidth,
    height: nodeHeight
  }));
}
