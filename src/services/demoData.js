/**
 * The demonstration dataset, mirroring server/db/seed.js so the browser build shows exactly what
 * the Postgres build shows. Ids follow the insertion order the SQL sequences produce.
 *
 * Movements sit either side of the 30-day window on purpose: older than 30 days becomes the
 * opening balance, inside it becomes the net movement. Without both, the headline equation has
 * nothing to show.
 */

export const BASES = [
  { id: 1, name: 'Fort Alpha', location: 'Northern Command, Sector 1' },
  { id: 2, name: 'Camp Bravo', location: 'Eastern Command, Sector 4' },
  { id: 3, name: 'Post Charlie', location: 'Southern Command, Sector 7' },
];

export const EQUIPMENT_TYPES = [
  { id: 1, name: 'M4 Carbine', category: 'WEAPON', unit: 'UNIT' },
  { id: 2, name: 'M9 Pistol', category: 'WEAPON', unit: 'UNIT' },
  { id: 3, name: 'Humvee', category: 'VEHICLE', unit: 'UNIT' },
  { id: 4, name: 'M1 Abrams', category: 'VEHICLE', unit: 'UNIT' },
  { id: 5, name: '5.56mm Ammunition', category: 'AMMUNITION', unit: 'ROUND' },
  { id: 6, name: '7.62mm Ammunition', category: 'AMMUNITION', unit: 'ROUND' },
  { id: 7, name: 'Night Vision Goggles', category: 'EQUIPMENT', unit: 'UNIT' },
  { id: 8, name: 'Field Radio', category: 'EQUIPMENT', unit: 'UNIT' },
];

/**
 * Passwords are in the source because this build has no server to keep a secret from — the whole
 * dataset already ships to the browser. They match the sample-credentials table in the README.
 */
export const USERS = [
  { id: 1, username: 'admin_user', password: 'AdminPass123!', full_name: 'Gen. Marcus Hale', role: 'ADMIN', base_id: null },
  { id: 2, username: 'commander_alpha', password: 'CommandPass123!', full_name: 'Col. Diane Reyes', role: 'BASE_COMMANDER', base_id: 1 },
  { id: 3, username: 'commander_bravo', password: 'CommandPass123!', full_name: 'Col. Owen Petrov', role: 'BASE_COMMANDER', base_id: 2 },
  { id: 4, username: 'logistics_officer', password: 'LogisticsPass123!', full_name: 'Maj. Sam Okoro', role: 'LOGISTICS_OFFICER', base_id: 1 },
];

const LOGISTICS = 4;
const COMMANDER_ALPHA = 2;

//  baseId, equipmentTypeId, quantity, unitCost, supplier, daysAgo
const PURCHASES = [
  [1, 1, 120, 1150, 'Colt Defense', 60],
  [1, 2, 60, 620, 'Beretta Defence', 58],
  [1, 5, 50_000, 0.62, 'Federal Ordnance', 57],
  [1, 6, 20_000, 0.94, 'Federal Ordnance', 56],
  [1, 3, 8, 74_500, 'AM General', 55],
  [1, 7, 40, 3400, 'Optics Systems Inc.', 52],
  [1, 8, 30, 1800, 'Harris Comms', 50],
  [2, 1, 90, 1150, 'Colt Defense', 59],
  [2, 2, 40, 620, 'Beretta Defence', 57],
  [2, 5, 30_000, 0.62, 'Federal Ordnance', 55],
  [2, 3, 6, 74_500, 'AM General', 53],
  [2, 7, 25, 3400, 'Optics Systems Inc.', 50],
  [2, 8, 20, 1800, 'Harris Comms', 48],
  [3, 1, 60, 1150, 'Colt Defense', 58],
  [3, 5, 20_000, 0.62, 'Federal Ordnance', 54],
  [3, 3, 4, 74_500, 'AM General', 52],
  [3, 4, 3, 6_100_000, 'General Dynamics', 46],
  [3, 8, 15, 1800, 'Harris Comms', 44],
  // ---- inside the 30-day reporting window ----
  [1, 1, 30, 1195, 'Colt Defense', 20],
  [1, 5, 15_000, 0.65, 'Federal Ordnance', 12],
  [1, 7, 10, 3600, 'Optics Systems Inc.', 5],
  [2, 3, 2, 76_000, 'AM General', 18],
  [2, 6, 8000, 0.97, 'Federal Ordnance', 9],
  [3, 1, 15, 1195, 'Colt Defense', 6],
  [3, 8, 10, 1850, 'Harris Comms', 3],
];

//  sourceBaseId, destinationBaseId, equipmentTypeId, quantity, notes, daysAgo
const TRANSFERS = [
  [1, 2, 7, 10, 'Night operations readiness package', 35],
  [1, 2, 1, 25, 'Reinforcement of 2nd Battalion', 22],
  [1, 3, 5, 10_000, 'Range qualification resupply', 15],
  [2, 3, 3, 2, 'Convoy support detachment', 10],
  [3, 1, 8, 5, 'Comms equipment rebalancing', 4],
];

//  baseId, equipmentTypeId, quantity, assignedTo, rank, purpose, daysAgo
const ASSIGNMENTS = [
  [1, 1, 20, 'Alpha Company 1st Platoon', 'SSG', 'Standing patrol issue', 50],
  [1, 1, 40, 'Elena Rivera', 'SGT', 'Border patrol rotation', 25],
  [1, 7, 12, 'Recon Team Six', 'CPT', 'Night reconnaissance sortie', 18],
  [2, 1, 30, 'Bravo Company 3rd Platoon', 'LT', 'Perimeter security detail', 8],
  [3, 3, 2, 'Transport Section', 'SFC', 'Supply run to forward outpost', 3],
];

//  baseId, equipmentTypeId, quantity, reason, daysAgo
const EXPENDITURES = [
  [1, 5, 5000, 'Annual marksmanship qualification', 40],
  [1, 5, 8000, 'Live-fire training exercise BRAVO-7', 14],
  [2, 6, 3000, 'Crew-served weapons familiarisation', 7],
  [3, 5, 4000, 'Combat readiness evaluation', 2],
];

/**
 * Dates are relative to first load, not baked in, so the dashboard's default 30-day window is
 * always populated however long after release someone opens the demo.
 */
export function buildSeed() {
  const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

  return {
    bases: BASES.map((base) => ({ ...base })),
    equipmentTypes: EQUIPMENT_TYPES.map((type) => ({ ...type })),
    users: USERS.map((user) => ({ ...user })),

    purchases: PURCHASES.map(([base_id, equipment_type_id, quantity, unit_cost, supplier, ago], index) => ({
      id: index + 1,
      base_id,
      equipment_type_id,
      quantity,
      unit_cost,
      supplier,
      occurred_at: daysAgo(ago),
      created_at: daysAgo(ago),
      created_by: LOGISTICS,
    })),

    transfers: TRANSFERS.map(([source_base_id, destination_base_id, equipment_type_id, quantity, notes, ago], index) => ({
      id: index + 1,
      source_base_id,
      destination_base_id,
      equipment_type_id,
      quantity,
      status: 'COMPLETED',
      notes,
      occurred_at: daysAgo(ago),
      created_at: daysAgo(ago),
      initiated_by: LOGISTICS,
    })),

    assignments: ASSIGNMENTS.map(([base_id, equipment_type_id, quantity, assigned_to, personnel_rank, purpose, ago], index) => ({
      id: index + 1,
      base_id,
      equipment_type_id,
      quantity,
      assigned_to,
      personnel_rank,
      purpose,
      occurred_at: daysAgo(ago),
      created_at: daysAgo(ago),
      created_by: COMMANDER_ALPHA,
    })),

    expenditures: EXPENDITURES.map(([base_id, equipment_type_id, quantity, reason, ago], index) => ({
      id: index + 1,
      base_id,
      equipment_type_id,
      quantity,
      reason,
      occurred_at: daysAgo(ago),
      created_at: daysAgo(ago),
      created_by: COMMANDER_ALPHA,
    })),

    auditLogs: [{
      id: 1,
      user_id: 1,
      username: 'admin_user',
      action: 'SEED',
      entity: 'SYSTEM',
      entity_id: null,
      details: 'Demonstration data loaded in this browser',
      ip_address: null,
      created_at: daysAgo(61),
    }],
  };
}
