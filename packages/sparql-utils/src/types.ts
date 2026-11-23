/** Shared recursive type helpers. */

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
// Types that should be passed through untouched by the recursive helpers below.
// Keeping Function here is what preserves call signatures (e.g. config callbacks).
type Builtin = Primitive | Function | Date | Error | RegExp;

/** Recursively makes every property of `T` optional, leaving Builtin types intact. */
export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/** Recursively marks every property of `T` as readonly, leaving Builtin types intact. */
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;
