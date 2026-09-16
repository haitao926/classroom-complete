function selectPeriod(value, periods) {
  const ordered = [...periods].sort((a, b) => Number(a.number) - Number(b.number));
  return ordered.find(p => p.start <= value && value < p.end)?.number
    ?? ordered.find(p => p.start > value)?.number
    ?? null;
}

function overlaps(a, b) {
  if (a.room !== b.room) return false;
  if (a.date && b.date && a.date !== b.date) return false;
  if (a.date || b.date) {
    const fixed = a.date ? a : b, weekly = a.date ? b : a;
    if (new Date(fixed.date + 'T00:00:00Z').getUTCDay() !== +weekly.day) return false;
  } else if (+a.day !== +b.day) return false;
  if (a.period && b.period) return a.period === b.period && (a.weeks === 'all' || b.weeks === 'all' || a.weeks === b.weeks);
  return a.start < b.end && a.end > b.start && (a.weeks === 'all' || b.weeks === 'all' || a.weeks === b.weeks);
}

module.exports = {selectPeriod, overlaps};
