const express = require('express');
const router = express.Router();
module.exports = (pool) => {


  // Login route
  router.post('/', async (req, res) => {
    const { user_id } = req.body;

    try {
        const user_name = await getUserName(user_id);

        return res.status(200).json({ username : user_name});     
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'An error occurred' });
    }

    
  });

  
  async function getUserName(userID) {
    const query = 'SELECT user_name FROM usertable WHERE user_id = $1;';
    const values = [userID];
    
    try {
      const result = await pool.query(query, values);
      if (result.rows.length > 0) {
        return result.rows[0].user_name;
      } else {
        return null; // Return null if no matching user found
      }
    } catch (error) {
      console.error("Error fetching user name:", error);
      throw error;
    }
  }


  return router;

};

  // Export the router and the getUserID function together.
