function *range(a: number, b?: number, step: number = 1): Generator<number> {
  for (let i = a; !b || i < b; i += step) {
    yield i
  }
}

if (import.meta.main) {
  const multiplesOf3 = new Set(Array.from(range(3, 1000, 3)))
  const multiplesOf5 = new Set(Array.from(range(5, 1000, 5)))
  const allMultiples = multiplesOf3.union(multiplesOf5)
  const multipleSum = Array.from(allMultiples).reduce((a, b) => a + b)
  console.log(multipleSum)
}
