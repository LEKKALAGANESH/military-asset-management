/**
 * The inventory model. SQL sums signed deltas per movement type; all arithmetic lives here,
 * so it is testable without a database.
 *
 *   Opening Balance = every movement before the window opened
 *   Net Movement    = Purchases + Transfers In − Transfers Out   (inside the window)
 *   Closing Balance = Opening + Net Movement − Assigned − Expended
 */

export const MOVEMENT_TYPES = [
  'PURCHASE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ASSIGNMENT',
  'EXPENDITURE',
];

export function computeBalances(rows = []) {
  const period = Object.fromEntries(MOVEMENT_TYPES.map((type) => [type, 0]));
  let openingBalance = 0;

  for (const row of rows) {
    const type = row.movement_type;
    if (!MOVEMENT_TYPES.includes(type)) continue;
    openingBalance += Number(row.opening_delta) || 0;
    period[type] = Number(row.period_delta) || 0;
  }

  // Deltas are signed; the dashboard reports magnitudes.
  const purchases = period.PURCHASE;
  const transfersIn = period.TRANSFER_IN;
  const transfersOut = Math.abs(period.TRANSFER_OUT);
  const assigned = Math.abs(period.ASSIGNMENT);
  const expended = Math.abs(period.EXPENDITURE);

  const netMovement = purchases + transfersIn - transfersOut;
  const closingBalance = openingBalance + netMovement - assigned - expended;

  return {
    openingBalance,
    purchases,
    transfersIn,
    transfersOut,
    netMovement,
    assigned,
    expended,
    closingBalance,
  };
}
