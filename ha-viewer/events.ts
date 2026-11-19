// Change events whose value may be "none". A CustomEvent's `detail` turns `undefined` into `null` (DOM rule), so a
// listener testing `detail === undefined` would store `null` instead of removing the field; that broke every
// condition editor (Phase 10.0). These events carry `{ value }`, where `undefined` survives.

/** The detail of a change event that may clear its value. */
export type OptionalChange<T> = Readonly<{ value: T | undefined }>;

/** A bubbling-free change event whose `detail.value` is the new value or `undefined` for "none". */
export const optionalChange = <T>(name: string, value: T | undefined): CustomEvent<OptionalChange<T>> =>
  new CustomEvent<OptionalChange<T>>(name, { detail: { value } });
