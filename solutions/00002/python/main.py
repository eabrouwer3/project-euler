def even_fib(max: int):
    a, b = 2, 3
    while a < max:
        yield a
        a, b = b, a + b # odd
        a, b = b, a + b # odd
        a, b = b, a + b # even

if __name__ == "__main__":
    even_fib_sum = sum(x for x in even_fib(4_000_000))
    print(even_fib_sum)
