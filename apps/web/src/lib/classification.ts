import {
  predict,
  type Model,
} from "../../../../packages/classifier/classifier";
import model from "../../../../packages/classifier/model.json";
export const classify = (description: string) =>
  predict(model as Model, description);
