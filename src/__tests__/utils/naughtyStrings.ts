import bigListOfNaughtyStrings from 'big-list-of-naughty-strings'
const naughtyStrings = bigListOfNaughtyStrings.slice()
export const bigEndianByteOrderMark = String.fromCharCode('65279' as any) // 0xFEFF

export const littleEndianByteOrderMark = String.fromCharCode('65534' as any) // 0xFFFE

export default naughtyStrings