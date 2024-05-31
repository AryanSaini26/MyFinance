const monthsArr = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


const rawDate = "\"5/13/2023";
const date = rawDate.substring(1);
console.log(date);
const extractedValue = date.split('/')[0];
const month = monthsArr[parseFloat(extractedValue) - 1];


console.log(month);