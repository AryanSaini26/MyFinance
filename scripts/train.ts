import { writeFile } from "node:fs/promises";
import rows from "../packages/classifier/training.json";
import { train } from "../packages/classifier/classifier";
const json = JSON.stringify(train(rows), null, 2) + "\n";
await writeFile("packages/classifier/model.json", json);
await writeFile("services/sync/internal/syncer/model.json", json);
console.log(`Trained on ${rows.length} synthetic examples. No accuracy claim.`);
