const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // Route handler for user registration
  router.post('/', async (req, res) => {
    const { user_name, user_password } = req.body;

    try {
      // Check if the user already exists in the database
      const userExists = await checkUserExists(user_name);
      if (userExists) {
        return res.status(400).json({ error: 'User already registered' });
      }

      // Proceed with user registration
      await registerUser(user_name, user_password);
      return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'An error occurred' });
    }
  });

  // Function to check if the user exists in the database
  async function checkUserExists(username) {
    const query = 'SELECT COUNT(*) FROM usertable WHERE user_name = $1';
    const values = [username];
    const result = await pool.query(query, values);
    return result.rows[0].count > 0;
  }

  // Function to register the user in the database
  async function registerUser(username, password) {
    const query = 'INSERT INTO usertable (user_name, user_password) VALUES ($1, $2)';
    const values = [username, password];
    await pool.query(query, values);
  }

  return router;
};

