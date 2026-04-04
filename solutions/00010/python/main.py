import math

def int_sqrt(n: int) -> int:
    return math.floor(math.sqrt(n))

def is_prime(n: int):
    if n % 2 == 0:
        return False
    for i in range(3, int_sqrt(n) + 1, 2):
        if n % i == 0:
            return False
    return True

if __name__ == '__main__':
    prime_sum = 2
    n = 3
    while n < 2_000_000:
        if is_prime(n):
            prime_sum += n
        n += 2
    print(prime_sum)
