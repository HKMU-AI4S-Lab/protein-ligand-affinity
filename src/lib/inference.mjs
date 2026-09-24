export function validatePrediction(payload, task) {
  if (payload?.ok === false && typeof payload.error === 'string') throw new Error(payload.error);
  const r = payload?.result;
  const valid = payload?.ok === true && r?.schemaVersion === 1 && r.liveInference === true && r.mode === 'local-inference'
    && r.task === task && ['logs', 'classification'].includes(task)
    && Number.isFinite(r.value) && (task !== 'classification' || (r.value >= 0 && r.value <= 1))
    && r.unit === (task === 'logs' ? 'log10(mol/L)' : 'uncalibrated probability')
    && typeof r.property === 'string' && typeof r.molecule?.smiles === 'string'
    && typeof r.molecule?.formula === 'string' && typeof r.molecule?.id === 'string'
    && typeof r.molecule?.depiction === 'string' && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(r.molecule.depiction)
    && typeof r.modelVersion === 'string' && /^[a-f0-9]{64}$/.test(r.checkpoint?.sha256)
    && typeof r.trainingDataset === 'string' && typeof r.split === 'string'
    && Number.isFinite(r.trainingCount) && Number.isFinite(r.testCount)
    && r.metrics && Object.values(r.metrics).every(Number.isFinite)
    && Number.isFinite(r.applicability?.nearestTrainingTanimoto)
    && typeof r.applicability?.datasetMembership === 'string'
    && Array.isArray(r.warnings) && r.warnings.every(w => typeof w === 'string')
    && typeof r.provenance === 'string' && r.uncertainty === null;
  if (!valid) throw new Error('The service returned an unexpected result. No prediction has been displayed.');
  return r;
}

