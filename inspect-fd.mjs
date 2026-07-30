import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

const buffer = readFileSync('data/FD-HANA-Copy-3fe85a.xlsx');
const workbook = read(buffer, { cellDates: true, defval: '' });

console.log('Sheet names:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  
  const data = utils.sheet_to_json(sheet, { defval: '' });
  console.log('Total rows:', data.length);
  if (data.length > 0) {
    console.log('\nHeaders:', Object.keys(data[0]));
    console.log('\nFirst 3 rows:');
    data.slice(0, 3).forEach((row, i) => {
      console.log(`\nRow ${i}:`, JSON.stringify(row, null, 2));
    });
  }
});
