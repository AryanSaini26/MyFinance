/**
 * This file takes exports the amount spent on transactions over the last 6 months and exports in a json file
 */
const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    router.post('/', async (req, res) => {
        const { user_id } = req.body;
        try {
            const data = await getRecentTransactions(user_id);
            return res.status(200).json(data);
            }
         catch (error) {
            res.status(500).json({ error: 'Internal server error' });
          }
        });
      /**
       * 
       * @param {*} username 
       * @returns 
       */

    async function getRecentTransactions(userid) {
        const query = 'SELECT transaction, keyword, date, category, month, amount, transaction_id FROM transactions WHERE user_id=$1 ORDER BY date DESC LIMIT 50;';
        const values = [userid];
        const result = await pool.query(query, values);
        return result.rows;
    }
      return router;
}

