import { it, expect } from "vitest";
import {
  train,
  predict,
  tokenize,
  type Model,
} from "../packages/classifier/classifier";
import training from "../packages/classifier/training.json";
import model from "../packages/classifier/model.json";
import goModel from "../services/sync/internal/syncer/model.json";
it("reproduces the versioned artifact and Go copy", () => {
  expect(train(training)).toEqual(model);
  expect(goModel).toEqual(model);
});
it("tokenizes consistently and provides unknown-word fallback", () => {
  expect(tokenize("COFFEE #123")).toEqual(["coffee"]);
  expect(predict(model as Model, "qzx 123").category).toBe("other");
});
it("classifies separate synthetic evaluation examples", () => {
  const cases = [
    ["morning cafe coffee", "dining"],
    ["grocery produce bread", "groceries"],
    ["retail shoes purchase", "shopping"],
    ["bus transit fare", "transport"],
    ["monthly internet bill", "utilities"],
    ["movie streaming tickets", "entertainment"],
    ["medical pharmacy prescription", "health"],
    ["airline vacation booking", "travel"],
    ["salary deposit wages", "income"],
    ["internal savings transfer", "transfer"],
    ["miscellaneous unidentified adjustment", "other"],
  ];
  for (const [text, category] of cases)
    expect(predict(model as Model, text).category, text).toBe(category);
  console.log(
    "Synthetic evaluation: 11 fixed cases; this does not estimate real-world accuracy.",
  );
});
it("uses smoothing and finite log scores for unseen category terms", () => {
  const result = predict(
    train([
      { text: "coffee", category: "dining" },
      { text: "bus", category: "transport" },
    ]),
    "coffee bus",
  );
  expect(Object.values(result.scores).every(Number.isFinite)).toBe(true);
  expect(() => train([])).toThrow();
});
