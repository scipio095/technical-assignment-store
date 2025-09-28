import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export function Restrict(permissions?: Permission) {
  return function (target: any, propertyKey: string) {
    if (!target.__permissions) {
      target.__permissions = {};
    }
    target.__permissions[propertyKey] = permissions ? permissions : target.defaultPolicy;
  }
}

export class Store implements IStore {
  defaultPolicy: Permission = "rw";

  allowedToRead(key: string): boolean {
    const permissions = (this as any).__permissions || {};
    const permission = permissions[key] || this.defaultPolicy;
    return permission === "r" || permission === "rw";
  }

  allowedToWrite(key: string): boolean {
    const permissions = (this as any).__permissions || {};
    const permission = permissions[key] || this.defaultPolicy;
    return permission === "w" || permission === "rw"
  }

  read(path: string): StoreResult {
    const parts = path.split(":");
    let current: any = this;
    
    for (const part of parts) {
      
      if (current instanceof Store) {
        if (!current.allowedToRead(part)) {
          throw new Error(`Read access to property '${part}' is denied.`);
        }
      }
      if (current && typeof current === "object" && part in current) {
        current = current[part];
        
        if (typeof current === "function") {
          current = current();
        }
      }
    }
    
    return current;
  }

  write(path: string, value: StoreValue): StoreValue {
    const parts = path.split(":");
    let current: any = this;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current instanceof Store) {
        const canRead = current.allowedToRead(part);
        const canWrite = current.allowedToWrite(part);
        const exists = part in current;
        const canTraverse = exists ? (canRead || canWrite) : canWrite;

        if (!canTraverse) {
          throw new Error(`Read access to property '${part}' is denied.`);
        }
      }

      if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
        current[part] = {};
      }
      current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    if (current instanceof Store) {
      if (!current.allowedToWrite(lastPart)) {
        throw new Error(`Write access to property '${lastPart}' is denied.`);
      }
    }

    let valueToAssign = value;

    if (value && typeof value === "object" && !(value instanceof Store) && !Array.isArray(value)) {
      const valueStore = new Store();
      valueStore.writeEntries(value as JSONObject);
      valueToAssign = valueStore;
    }
    current[lastPart] = valueToAssign;

    return value;
  }

  writeEntries(entries: JSONObject): void {
    for (const [key, value] of Object.entries(entries)) {
      this.write(key, value);
    }
  }

  entries(): JSONObject {
    const result: JSONObject = {};
    for (const key of Object.keys(this)) {
      if (this.allowedToRead(key)) {
        const value = (this as any)[key];
        if (value instanceof Store) {
          result[key] = value.entries();
        } else if (typeof value === "function") {
          result[key] = value();
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}
