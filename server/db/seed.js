import bcrypt from 'bcryptjs';
import { closePool, withTransaction } from '../config/db.js';

/**
 * Deterministic demo data, safe to re-run.
 *
 * Movements sit either side of a 30-day window on purpose: older than 30 days becomes the
 * opening balance, inside it becomes the net movement. Without both, the headline equation
 * has nothing to show.
 */

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000);

const BASES = [
  { name: 'Fort Alpha', location: 'Northern Command, Sector 1' },
  { name: 'Camp Bravo', location: 'Eastern Command, Sector 4' },
  { name: 'Post Charlie', location: 'Southern Command, Sector 7' },
];

const EQUIPMENT = [
  { name: 'M4 Carbine', category: 'WEAPON', unit: 'UNIT' },
  { name: 'M9 Pistol', category: 'WEAPON', unit: 'UNIT' },
  { name: 'Humvee', category: 'VEHICLE', unit: 'UNIT' },
  { name: 'M1 Abrams', category: 'VEHICLE', unit: 'UNIT' },
  { name: '5.56mm Ammunition', category: 'AMMUNITION', unit: 'ROUND' },
  { name: '7.62mm Ammunition', category: 'AMMUNITION', unit: 'ROUND' },
  { name: 'Night Vision Goggles', category: 'EQUIPMENT', unit: 'UNIT' },
  { name: 'Field Radio', category: 'EQUIPMENT', unit: 'UNIT' },
];

// Passwords match the sample-credentials table in the README.
const USERS = [
  { username: 'admin_user', password: 'AdminPass123!', fullName: 'Gen. Marcus Hale', role: 'ADMIN', base: null },
  { username: 'commander_alpha', password: 'CommandPass123!', fullName: 'Col. Diane Reyes', role: 'BASE_COMMANDER', base: 'Fort Alpha' },
  { username: 'commander_bravo', password: 'CommandPass123!', fullName: 'Col. Owen Petrov', role: 'BASE_COMMANDER', base: 'Camp Bravo' },
  { username: 'logistics_officer', password: 'LogisticsPass123!', fullName: 'Maj. Sam Okoro', role: 'LOGISTICS_OFFICER', base: 'Fort Alpha' },
];

//  base, equipment, quantity, unitCost, supplier, daysAgo
const PURCHASES = [
  ['Fort Alpha', 'M4 Carbine', 120, 1150, 'Colt Defense', 60],
  ['Fort Alpha', 'M9 Pistol', 60, 620, 'Beretta Defence', 58],
  ['Fort Alpha', '5.56mm Ammunition', 50_000, 0.62, 'Federal Ordnance', 57],
  ['Fort Alpha', '7.62mm Ammunition', 20_000, 0.94, 'Federal Ordnance', 56],
  ['Fort Alpha', 'Humvee', 8, 74_500, 'AM General', 55],
  ['Fort Alpha', 'Night Vision Goggles', 40, 3400, 'Optics Systems Inc.', 52],
  ['Fort Alpha', 'Field Radio', 30, 1800, 'Harris Comms', 50],
  ['Camp Bravo', 'M4 Carbine', 90, 1150, 'Colt Defense', 59],
  ['Camp Bravo', 'M9 Pistol', 40, 620, 'Beretta Defence', 57],
  ['Camp Bravo', '5.56mm Ammunition', 30_000, 0.62, 'Federal Ordnance', 55],
  ['Camp Bravo', 'Humvee', 6, 74_500, 'AM General', 53],
  ['Camp Bravo', 'Night Vision Goggles', 25, 3400, 'Optics Systems Inc.', 50],
  ['Camp Bravo', 'Field Radio', 20, 1800, 'Harris Comms', 48],
  ['Post Charlie', 'M4 Carbine', 60, 1150, 'Colt Defense', 58],
  ['Post Charlie', '5.56mm Ammunition', 20_000, 0.62, 'Federal Ordnance', 54],
  ['Post Charlie', 'Humvee', 4, 74_500, 'AM General', 52],
  ['Post Charlie', 'M1 Abrams', 3, 6_100_000, 'General Dynamics', 46],
  ['Post Charlie', 'Field Radio', 15, 1800, 'Harris Comms', 44],
  // ---- inside the 30-day reporting window ----
  ['Fort Alpha', 'M4 Carbine', 30, 1195, 'Colt Defense', 20],
  ['Fort Alpha', '5.56mm Ammunition', 15_000, 0.65, 'Federal Ordnance', 12],
  ['Fort Alpha', 'Night Vision Goggles', 10, 3600, 'Optics Systems Inc.', 5],
  ['Camp Bravo', 'Humvee', 2, 76_000, 'AM General', 18],
  ['Camp Bravo', '7.62mm Ammunition', 8000, 0.97, 'Federal Ordnance', 9],
  ['Post Charlie', 'M4 Carbine', 15, 1195, 'Colt Defense', 6],
  ['Post Charlie', 'Field Radio', 10, 1850, 'Harris Comms', 3],
];

//  source, destination, equipment, quantity, note, daysAgo
const TRANSFERS = [
  ['Fort Alpha', 'Camp Bravo', 'Night Vision Goggles', 10, 'Night operations readiness package', 35],
  ['Fort Alpha', 'Camp Bravo', 'M4 Carbine', 25, 'Reinforcement of 2nd Battalion', 22],
  ['Fort Alpha', 'Post Charlie', '5.56mm Ammunition', 10_000, 'Range qualification resupply', 15],
  ['Camp Bravo', 'Post Charlie', 'Humvee', 2, 'Convoy support detachment', 10],
  ['Post Charlie', 'Fort Alpha', 'Field Radio', 5, 'Comms equipment rebalancing', 4],
];

//  base, equipment, quantity, assignedTo, rank, purpose, daysAgo
const ASSIGNMENTS = [
  ['Fort Alpha', 'M4 Carbine', 20, 'Alpha Company 1st Platoon', 'SSG', 'Standing patrol issue', 50],
  ['Fort Alpha', 'M4 Carbine', 40, 'Elena Rivera', 'SGT', 'Border patrol rotation', 25],
  ['Fort Alpha', 'Night Vision Goggles', 12, 'Recon Team Six', 'CPT', 'Night reconnaissance sortie', 18],
  ['Camp Bravo', 'M4 Carbine', 30, 'Bravo Company 3rd Platoon', 'LT', 'Perimeter security detail', 8],
  ['Post Charlie', 'Humvee', 2, 'Transport Section', 'SFC', 'Supply run to forward outpost', 3],
];

//  base, equipment, quantity, reason, daysAgo
const EXPENDITURES = [
  ['Fort Alpha', '5.56mm Ammunition', 5000, 'Annual marksmanship qualification', 40],
  ['Fort Alpha', '5.56mm Ammunition', 8000, 'Live-fire training exercise BRAVO-7', 14],
  ['Camp Bravo', '7.62mm Ammunition', 3000, 'Crew-served weapons familiarisation', 7],
  ['Post Charlie', '5.56mm Ammunition', 4000, 'Combat readiness evaluation', 2],
];

async function seed() {
  await withTransaction(async (client) => {
    // RESTART IDENTITY keeps ids stable across re-runs, so documented sample ids hold.
    await client.query(`
      TRUNCATE audit_logs, expenditures, assignments, transfers, purchases, users,
               equipment_types, bases
      RESTART IDENTITY CASCADE
    `);

    const baseId = new Map();
    for (const base of BASES) {
      const { rows } = await client.query(
        'INSERT INTO bases (name, location) VALUES ($1, $2) RETURNING id',
        [base.name, base.location],
      );
      baseId.set(base.name, rows[0].id);
    }

    const equipmentId = new Map();
    for (const item of EQUIPMENT) {
      const { rows } = await client.query(
        'INSERT INTO equipment_types (name, category, unit) VALUES ($1, $2, $3) RETURNING id',
        [item.name, item.category, item.unit],
      );
      equipmentId.set(item.name, rows[0].id);
    }

    const userId = new Map();
    for (const user of USERS) {
      const hash = await bcrypt.hash(user.password, 12);
      const { rows } = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, base_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user.username, hash, user.fullName, user.role, user.base ? baseId.get(user.base) : null],
      );
      userId.set(user.username, rows[0].id);
    }

    const logistics = userId.get('logistics_officer');
    const commanderAlpha = userId.get('commander_alpha');
    const admin = userId.get('admin_user');

    for (const [base, equipment, quantity, unitCost, supplier, ago] of PURCHASES) {
      await client.query(
        `INSERT INTO purchases (base_id, equipment_type_id, quantity, unit_cost, supplier, occurred_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [baseId.get(base), equipmentId.get(equipment), quantity, unitCost, supplier, daysAgo(ago), logistics],
      );
    }

    for (const [source, destination, equipment, quantity, notes, ago] of TRANSFERS) {
      await client.query(
        `INSERT INTO transfers
           (source_base_id, destination_base_id, equipment_type_id, quantity, status, notes, occurred_at, initiated_by)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7)`,
        [baseId.get(source), baseId.get(destination), equipmentId.get(equipment), quantity, notes, daysAgo(ago), logistics],
      );
    }

    for (const [base, equipment, quantity, assignedTo, rank, purpose, ago] of ASSIGNMENTS) {
      await client.query(
        `INSERT INTO assignments
           (base_id, equipment_type_id, quantity, assigned_to, personnel_rank, purpose, occurred_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [baseId.get(base), equipmentId.get(equipment), quantity, assignedTo, rank, purpose, daysAgo(ago), commanderAlpha],
      );
    }

    for (const [base, equipment, quantity, reason, ago] of EXPENDITURES) {
      await client.query(
        `INSERT INTO expenditures (base_id, equipment_type_id, quantity, reason, occurred_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [baseId.get(base), equipmentId.get(equipment), quantity, reason, daysAgo(ago), commanderAlpha],
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, username, action, entity, details)
       VALUES ($1, 'admin_user', 'SEED', 'SYSTEM', 'Database seeded with demonstration data')`,
      [admin],
    );

    // Fail loudly rather than ship a dashboard showing impossible stock.
    const { rows: negatives } = await client.query('SELECT * FROM assets WHERE quantity < 0');
    if (negatives.length > 0) {
      throw new Error(`Seed produced negative stock: ${JSON.stringify(negatives)}`);
    }
  });
}

try {
  await seed();
  console.log('✔ Seed complete.');
  console.log('  Bases: 3 · Equipment types: 8 · Users: 4');
  console.log('  Sign in with:');
  for (const user of USERS) {
    console.log(`    ${user.role.padEnd(18)} ${user.username.padEnd(18)} ${user.password}`);
  }
} catch (error) {
  console.error('✖ Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
