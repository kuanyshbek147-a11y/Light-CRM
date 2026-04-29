export type Role = "admin" | "manager";

export interface User {
  id: string;
  workspace_id: string;
  full_name: string;
  email: string;
  role: Role;
  password_hash: string;
  login?: string | null;
}
