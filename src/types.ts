// TODO: Move more of the basic Watermelon types here
export type $RE<Type> = Readonly<Type>
export type $Exact<Type> = Type
// Flow's Class<T>: a constructor of T whose statics (e.g. `table`, `associations`) are accessible
export type Class<T> = (new (...args: any[]) => T) & Record<string, any>
