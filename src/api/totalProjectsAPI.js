/**
 * This file takes exports the amount spent on transactions over the last 6 months and exports in a json file
 */




const express = require('express');
const router = express.Router();

module.exports = (pool) => {
    router.post('/', async (req, res) => {
        const { user_id } = req.body;
        try {
            const transactionTotal = await getTransactionTotal(user_id);
            
            return res.status(200).json({transactions: transactionTotal});


          } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
          }
        });
      /**
       * 
       * @param {*} username 
       * @returns 
       */

    async function getTransactionTotal(userid) {
        const query = 'SELECT COUNT(*) FROM transactions WHERE user_id= $1;';
        const values = [userid];
        const result = await pool.query(query, values);
        return result.rows[0];
      }


      return router;
}

