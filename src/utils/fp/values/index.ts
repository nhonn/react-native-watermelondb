export default function values<
  T,
  Key extends PropertyKey,
  O extends Record<Key, T>,
>(obj: O): T[] {
  return Object.values(obj)
}
