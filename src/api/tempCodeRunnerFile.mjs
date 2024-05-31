/**
 * This is the backend that alllows users to upload new csv data to table
 */

import { extract } from "backend/extract";

const filePath = 'src/backend/pcbanking (3).csv'

extract(filePath);