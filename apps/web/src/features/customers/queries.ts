/** Claves de TanStack Query del módulo. Invalidar `CLIENTS` o `PETS` refresca todo lo suyo. */
export const CLIENTS = ["clients"] as const;
export const PETS = ["pets"] as const;

export const clientKey = (id: string) => [...CLIENTS, "detail", id] as const;
export const clientPetsKey = (id: string) => [...PETS, "of-client", id] as const;
export const petKey = (id: string) => [...PETS, "detail", id] as const;
