const numberFormatter = new Intl.NumberFormat();
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export const formatNumber = (value) => numberFormatter.format(Number(value ?? 0));
export const formatDateTime = (value) => (value ? dateTimeFormatter.format(new Date(value)) : '—');

export const formatCurrency = (value) =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

/** `<input type="date">` only accepts YYYY-MM-DD, in local time. */
export const toInputDate = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export const daysAgo = (days) => toInputDate(new Date(Date.now() - days * 86_400_000));

export const defaultFilters = () => ({
  startDate: daysAgo(30),
  endDate: toInputDate(new Date()),
  baseId: '',
  equipmentTypeId: '',
});

/**
 * Dragging one end of a date range past the other pulls the other end with it, so the UI
 * never holds an inverted window and fires requests the API rejects with a 400.
 * ISO dates compare correctly as strings.
 */
export function clampDateRange(filters, changedKey) {
  const { startDate, endDate } = filters;
  if (!startDate || !endDate || startDate <= endDate) return filters;
  return changedKey === 'startDate'
    ? { ...filters, endDate: startDate }
    : { ...filters, startDate: endDate };
}
