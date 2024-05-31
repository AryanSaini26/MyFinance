/**
 This file inputs data to my postgres Database
 Data is taken from json file userTransactions
 */

 

const pool = require('../backend/server');
const jsonData = './src/backend/userTransactions.json'
const fs = require('fs');

// Read the JSON file
fs.readFile(jsonData, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  // Parse JSON data
  try {
    const jsonData = JSON.parse(data);

    //JSON data is in array format
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      addToDatabase(jsonData);
    }
    else {
      console.error("CSV file is empty.")
    }
    
    console.log("Values have been entered");
    pool.pool.end()

// Error-Handling
  } catch (error) {
    console.error('Error parsing JSON:', error);
  }
});
  

function addToDatabase(fileName){
  fileName.forEach((element) => {
    // vars
    let transaction = element.transaction;
    let amount = parseFloat(element.amount);
    let keyword = element.keyword;
    let category = element.category;
    let user_id = 2; //to change to connect with login.js
    let month = "June" // to change to be taken from frontend

    const query = 'INSERT INTO transactions (user_id, transaction, amount, keyword, category, month) VALUES ($1, $2, $3, $4, $5, $6)';
    const values = [user_id, transaction, amount, keyword, category, month];
    
    pool.pool.query(query, values);
    
    
    
  });

};