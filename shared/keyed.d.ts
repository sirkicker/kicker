// Same as the built-in mapped object type, under our own name.
type Keyed<K extends keyof any, T> = { [P in K]: T };
