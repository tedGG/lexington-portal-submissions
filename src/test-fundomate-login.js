require('dotenv').config();
const { submitLoan } = require('./automators/fundomate');

(async () => {
  console.log('Testing Fundomate login...');
  try {
    const result = await submitLoan({ demo: true }, null, null, []);
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
