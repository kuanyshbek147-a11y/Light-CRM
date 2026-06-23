import dotenv from "dotenv";
import path from "path";

const projectRoot = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(projectRoot, "infra", ".env") });
dotenv.config({ path: path.join(projectRoot, "infra", "meta.secrets.env"), override: true });
dotenv.config({ path: path.join(projectRoot, ".env"), override: true });

export const PROJECT_ROOT = projectRoot;
