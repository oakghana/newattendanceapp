import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

const buffer = readFileSync('data/FD-HANA-Copy-3fe85a.xlsx');
const workbook = read(buffer, { cellDates: true, defval: '' });

console.log('Sheet names:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  console.log('Sheet ref:', sheet['!ref']);
  
  const data = utils.sheet_to_json(sheet, { defval: '' });
  console.log('Total rows:', data.length);
  console.log('\nFirst 5 rows:');
  data.slice(0, 5).forEach((row, i) => {
    console.log(`Row ${i}:`, JSON.stringify(row, null, 2));
  });
});
