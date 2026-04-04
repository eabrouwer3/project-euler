import math

def is_prime(n):
    for i in range(3, math.floor(math.sqrt(n)) + 1, 2):
        if n % i == 0:
            return False
    return True

if __name__ == '__main__':
    # Already count 2, cause it's the only even prime number
    prime_count = 1
    n = 1
    while prime_count < 10001:
        n += 2
        if is_prime(n):
            prime_count += 1
    print(n)
