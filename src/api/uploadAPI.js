/**
 * 
 * This file takes an api call, with parameters of the path to the csv file to read
 * It extracts/classifies data so oit can be put into user Transactions.json, before being added
 * to database via insertAPI
 * 
 * ML model for keyword and category is trained via data in learning folder, I will be managing an updating accordingly
 * 
 * 
 * 
 * Used in parallel with insertAPI to add uploaded user transactions to database;
 */


//imports/reqs
const express = require('express');
const router = express.Router();
const multer = require('multer'); // Import multer
const fs = require('fs');
const fileToWrite = 'src/backend/userTransactions.json';
const natural = require('natural');

module.exports = (pool) => {
  // Set up multer storage
  const storage = multer.memoryStorage(); // Store uploaded files in memory
  const upload = multer({ storage: storage });

  router.post('/', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      // Convert buffer to string (CSV content)
      const contents = req.file.buffer.toString();
      console.log('CSV Contents:', contents);


      // CSV processing
      const monthsArr = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const rows = contents.split("\n");
      const transactions = [];
      const amounts = [];
      const dates = [];
      const months = [];

      for (let i = 0; i < rows.length - 1; i++) {
        const columns = rows[i].split(",");

        if (columns.length >= 3) {
          const rawDate = columns[0];
          const date = rawDate.substring(1);
          console.log(date);
          const extractedValue = date.split('/')[0];
          const month = monthsArr[parseFloat(extractedValue) - 1];
          
          


          const transaction = columns[1];
          const amount = parseFloat(columns[2]);

          dates.push(date);
          months.push(month);
          transactions.push(transaction);
          amounts.push(amount);
        } else {
          throw new Error("Invalid CSV file structure. Description or amount column not found in row.");
        }
      }

      const result = transactions.map((transaction, index) => {
        return {
          transaction: transaction,
          amount: amounts[index],
          date: dates[index],
          month: months[index]
        };
      });

      const jsonData = JSON.stringify(result);

      fs.writeFile(fileToWrite, jsonData, (err) => {
        if (err) {
          console.error('Error saving result:', err);
        } else {
          console.log('Result saved to ' + fileToWrite);
          performClassificationAndAddKeyword();
        }
      });

      function performClassificationAndAddKeyword() {
        const keywordClassifier = new natural.BayesClassifier();
        const categoryClassifier = new natural.BayesClassifier();

        const data = require('../backend/learning/dataset.json');

        data.forEach(item => {
          const { transaction, keyword, category, amount } = item;
          keywordClassifier.addDocument(transaction, keyword);
          categoryClassifier.addDocument([transaction, keyword, amount], category);
        });

        keywordClassifier.train();
        categoryClassifier.train();

        addKeywordToJSON(keywordClassifier, categoryClassifier);
      }

      function addKeywordToJSON(keywordClassifier, categoryClassifier) {
        const existingData = JSON.parse(fs.readFileSync(fileToWrite));

        existingData.forEach((obj) => {
          const transaction = obj.transaction;
          const keyword = keywordClassifier.classify(transaction);
          const amount = obj.amount;
          obj.keyword = keyword;
          obj.category = categoryClassifier.classify([transaction, keyword, amount]);
        });

        fs.writeFileSync(fileToWrite, JSON.stringify(existingData));
        console.log('userTransactions.json Updated');
        return res.status(200).json({ message: 'Transactions inserted successfully' });
      }
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ message: 'Error mate' });
    }
  });

  return router;
};
