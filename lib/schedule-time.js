function selectPeriod(value, periods) {
  const ordered = [...periods].sort((a, b) => Number(a.number) - Number(b.number));
  return ordered.find(p => p.start <= value && value < p.end)?.number
    ?? ordered.find(p => p.start > value)?.number
    ?? null;
}

module.exports = {selectPeriod};
