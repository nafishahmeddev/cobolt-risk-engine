import { closePrimary, connectPrimary } from "./primary";

export async function initDb(): Promise<void> {
  await connectPrimary();
}

export async function closeDb(): Promise<void> {
  await closePrimary();
}
