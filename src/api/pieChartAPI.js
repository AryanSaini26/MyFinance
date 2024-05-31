//This file split percentage of transactions for eachCategoary for pieChart 


// to Implement for the last month?

const express = require('express');
const router = express.Router();
module.exports = (pool) => {
  router.post('/', async (req, res) => {
    const { user_id } = req.body;

    const categories = [
      'Food & Dining',
    'Entertainment',
    'Groceries',
    'Health, Fitness Personal Care',
    'Shopping',
    'Transfer',
    'Transportation',
    'Travel',
    'Utilities',
     'Other'
    ];
  
    var dict = {};

    var  totalAmount = await getTotal(user_id);
    totalAmount = totalAmount.sum;
    if (totalAmount==0) totalAmount = -1;


    function getCategoryPercentage(category, callback) {
      const query = `
      select SUM(transactions.amount) as transaction_sum from transactions where amount < 0 and user_id=$2 AND category =$1;
      `;
      const values = [category, user_id];
  
      pool.query(query, values, (err, result) => {
        if (err) {
          console.error('Error executing query:', err);
          callback(err);
          return;
        }
  
        var categoryPercentage = parseFloat(result.rows[0].transaction_sum)/totalAmount * 100;
        categoryPercentage = categoryPercentage.toFixed(2) - 0.00; //gets rid of extra zeroes
        callback(null, categoryPercentage);
      });
    }



  
    // Function to calculate percentages for all categories
    function calculateCategoryPercentages(index) {
      if (index < categories.length) {
        const category = categories[index];
        getCategoryPercentage(category, (err, categoryPercentage) => {
          if (err) {
            console.error('Error fetching category percentage:', err);
            return res.status(500).json({ error: 'Internal Server Error' });

          }
  
          dict[category] = categoryPercentage;
          calculateCategoryPercentages(index + 1);
        });
      } else {
        // All percentages calculated, send the response
        return res.status(201).json(dict);
      }
    }

    calculateCategoryPercentages(0);


    async function getTotal(user_id){

      const query = 'select SUM(transactions.amount) from transactions where amount < 0 and user_id=$1';
      const values = [user_id];
      const result = await pool.query(query, values);
      return result.rows[0];

    }


});
return router;
}
