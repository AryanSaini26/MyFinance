export type TrainingRow = { text: string; category: string };
export type Model = {
  version: number;
  documents: number;
  vocabulary: string[];
  classes: Record<
    string,
    { documents: number; total: number; counts: Record<string, number> }
  >;
};
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}
export function train(rows: TrainingRow[]): Model {
  if (!rows.length) throw new Error("Training data is empty");
  const model: Model = {
    version: 1,
    documents: rows.length,
    vocabulary: [],
    classes: {},
  };
  const vocabulary = new Set<string>();
  for (const row of rows) {
    const c = (model.classes[row.category] ??= {
      documents: 0,
      total: 0,
      counts: {},
    });
    c.documents++;
    for (const word of tokenize(row.text)) {
      vocabulary.add(word);
      c.counts[word] = (c.counts[word] ?? 0) + 1;
      c.total++;
    }
  }
  model.vocabulary = [...vocabulary].sort();
  return model;
}
export function predict(
  model: Model,
  text: string,
): { category: string; scores: Record<string, number>; tokens: string[] } {
  const vocabulary = new Set(model.vocabulary),
    tokens = tokenize(text).filter((t) => vocabulary.has(t));
  if (!tokens.length) return { category: "other", scores: {}, tokens };
  const scores: Record<string, number> = {};
  let category = "other",
    best = -Infinity;
  for (const [name, c] of Object.entries(model.classes).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    let score = Math.log(c.documents / model.documents);
    for (const token of tokens)
      score += Math.log(
        ((c.counts[token] ?? 0) + 1) / (c.total + model.vocabulary.length),
      );
    scores[name] = score;
    if (score > best) {
      best = score;
      category = name;
    }
  }
  return { category, scores, tokens };
}
