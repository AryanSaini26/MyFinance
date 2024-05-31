//Takes transactions in userTransactions.json and put into database

const express = require('express');
const router = express.Router();
const fs = require("fs");

const filePath = 'src/backend/userTransactions.json';
module.exports = (pool) => {


    router.post('/', async (req, res) => {
        try {
            const { user_id } = req.body;
    
            const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
            function insert() {
                for (const item of jsonData) {
                    insertTransaction( item.transaction,item.keyword, item.date, item.category, item.month, user_id, item.amount);
                }
            }
    
            await insert();
            
            res.status(200).json({ message: 'Transactions inserted successfully' });
        } catch (error) {
            console.error('Error while processing request:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });



  async function insertTransaction(transaction,keyword,  date, category, month, user_id, amount){
    const query = 'INSERT INTO transactions (transaction, keyword, date, category, month, user_id, amount) VALUES ($1, $2, $3, $4, $5, $6, $7)';
    const values = [transaction, keyword, date, category, month, user_id, amount];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  return router;
}