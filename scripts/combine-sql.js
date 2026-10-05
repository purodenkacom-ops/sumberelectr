const fs = require('fs');
const path = require('path');

const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
const dataSql = fs.readFileSync(path.join(__dirname, '../data-migration/import_data.sql'), 'utf8');

const combined = `${schemaSql}\n\n-- DATA IMPORT --\n\n${dataSql}`;

fs.writeFileSync(path.join(__dirname, '../data-migration/complete_migration.sql'), combined, 'utf8');
console.log('✓ Created complete_migration.sql:', (fs.statSync(path.join(__dirname, '../data-migration/complete_migration.sql')).size / 1024 / 1024).toFixed(2), 'MB');
