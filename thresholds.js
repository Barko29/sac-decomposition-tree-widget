export function getThresholdColor(actual, plan, settings = {}) {
  const thresholdAmber = Number(settings.thresholdAmber ?? 0.9);
  const thresholdGreen = Number(settings.thresholdGreen ?? 1.0);
  const neutralColor = settings.neutralColor ?? "#64748b";
  const greenColor = settings.greenColor ?? "#16a34a";
  const amberColor = settings.amberColor ?? "#f59e0b";
  const redColor = settings.redColor ?? "#dc2626";

  if (!Number.isFinite(actual) || !Number.isFinite(plan) || plan === 0) {
    return neutralColor;
  }

  const ratio = actual / plan;
  if (ratio >= thresholdGreen) return greenColor;
  if (ratio >= thresholdAmber) return amberColor;
  return redColor;
}

export function getVariance(actual, plan) {
  const variance = actual - plan;
  const variancePct = plan === 0 ? null : variance / plan;
  return { variance, variancePct };
}
