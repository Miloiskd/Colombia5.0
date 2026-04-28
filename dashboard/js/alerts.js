window.getPriorityClass = (priority) => {
  const value = String(priority || '').toUpperCase();
  if (value === 'CRITICO') return 'priority priority--critico';
  if (value === 'ALTO') return 'priority priority--alto';
  if (value === 'MEDIO') return 'priority priority--medio';
  return 'priority priority--bajo';
};

window.getRecommendationTagClass = (type) => {
  const value = String(type || '').toUpperCase();
  if (value === 'RESTAURAR') return 'recommendation__tag tag--restaurar';
  if (value === 'AMPLIAR') return 'recommendation__tag tag--ampliar';
  if (value === 'MANTENER') return 'recommendation__tag tag--mantener';
  if (value === 'EVALUAR') return 'recommendation__tag tag--evaluar';
  return 'recommendation__tag tag--monitorear';
};
