import { API_BASE_URL } from "../../shared/config/api";
import {
  mapRegisterResponse,
  type RegisterResult,
  type RegisterSessionUser
} from "./registerValidation";

export type RegisterAccountInput = {
  email: string;
  password: string;
  companyName?: string;
};

type RegisterResponseBody = {
  token?: string;
  user?: RegisterSessionUser;
  error?: string;
  field?: string;
};

export async function registerAccount(input: RegisterAccountInput): Promise<RegisterResult> {
  const companyName = input.companyName?.trim() || "";
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email.trim(),
        password: input.password,
        ...(companyName ? { companyName } : {})
      })
    });

    const raw = await response.text();
    let data: RegisterResponseBody = {};
    try {
      data = raw ? (JSON.parse(raw) as RegisterResponseBody) : {};
    } catch {
      return mapRegisterResponse(response.status || 500, {});
    }

    return mapRegisterResponse(response.status, data);
  } catch {
    return mapRegisterResponse(0, {});
  }
}
