// NOTE: Only use with records! Not guaranteed to work correctly if keys have undefineds as values
export default function areRecordsEqual<T extends {}>(
  left: T,
  right: T
): boolean {
  if (left === right) {
    return true
  }

  const leftKeys = Object.keys(left)
  const leftKeysLen = leftKeys.length

  if (leftKeysLen !== Object.keys(right).length) {
    return false
  }

  let key

  for (let i = 0; i < leftKeysLen; i++) {
    key = leftKeys[i]

    if ((left as any)[key!] !== (right as any)[key!]) {
      return false
    }
  }

  return true
}