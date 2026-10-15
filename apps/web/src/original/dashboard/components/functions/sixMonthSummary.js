export default function getLast6MonthsArray() {
  const today = new Date();
  const monthsArray = [];

  for (let i = 5; i >= 0; i--) {
    const targetMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthsArray.push(targetMonth.toLocaleString("default", { month: "short" }));
  }

  return monthsArray;
}
